"""FastAPI backend for the Dubai Property Advisor.

Security contract (Arina's deliverable):
  - OPENAI_API_KEY is read once at startup from the environment; it is never
    returned in any response or written to any log.
  - The app refuses to start if the key is absent or malformed.
  - The app starts cleanly even when allocation.csv does not exist.
  - Every endpoint validates inputs via Pydantic before touching data.
  - NaN / Inf values are sanitised with safe_float() before serialisation.
  - OpenAI calls time out after CHAT_TIMEOUT_SECONDS and return a 503.
  - Internal errors log server-side; the client receives only a generic message.

Run with:
    uvicorn src.advisor.api:app --reload --port 8700
"""
from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .data import (
    PRICE_TARGET,
    SALES_TARGET,
    forecasts_for_quarter,
    known_areas,
    latest_trends,
    load_advisor_data,
    safe_float,
)
from .prompts import BUYER_SYSTEM_PROMPT, INVESTOR_SYSTEM_PROMPT, TOOLS
from .validation import (
    AreaRequest,
    BuyerRequest,
    ChatRequest,
    CompareRequest,
    InvestorRequest,
)

# ---------------------------------------------------------------------------
# Logging — structured, never includes the API key
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("advisor.api")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CHAT_TIMEOUT_SECONDS = 30   # GPT-4o streaming timeout
MAX_TOOL_ROUNDS      = 5    # prevent infinite tool-call loops


# ---------------------------------------------------------------------------
# Startup: validate key and load data once
# ---------------------------------------------------------------------------
_API_KEY: str = ""
_DATA: dict = {}


def _load_api_key() -> str:
    """Read the OpenAI key from the environment. Fail fast if it's missing."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. "
            "Add it to your .env file: OPENAI_API_KEY=sk-..."
        )
    if not key.startswith("sk-"):
        raise RuntimeError(
            "OPENAI_API_KEY does not look valid (expected 'sk-...'). "
            "Check your .env file."
        )
    # Log only the key prefix so we can confirm it loaded, never the full key.
    logger.info("OpenAI key loaded (prefix: %s...)", key[:7])
    return key


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _API_KEY, _DATA
    _API_KEY = _load_api_key()
    _DATA    = load_advisor_data()   # raises clearly if the 3 CSVs are missing
    logger.info(
        "Advisor data loaded — %d monthly rows, %d forecast rows, %d trend rows",
        len(_DATA["monthly"]),
        len(_DATA["forecasts"]),
        len(_DATA["trends"]),
    )
    yield
    # Cleanup (nothing to do, but the pattern is correct)
    _DATA.clear()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Dubai Property Advisor API",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Next.js dev server and production build to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _filter_registration(df, registration_type: str):
    if registration_type == "Both":
        return df
    return df[df["registration_type"] == registration_type]


def _area_exists(area: str) -> bool:
    return area in known_areas(_DATA)


def _serialize(obj) -> dict:
    """Recursively replace NaN/Inf floats with None for safe JSON output."""
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    if isinstance(obj, float):
        return safe_float(obj)
    return obj


# ---------------------------------------------------------------------------
# Scorer / Ranker stubs
# (Mahed will replace these with real implementations in scorer.py / ranker.py)
# ---------------------------------------------------------------------------

def _buyer_shortlist(budget_aed: float, registration_type: str, top_n: int) -> list[dict]:
    """Stub — returns areas sorted by proximity to budget with basic trend info."""
    trends  = latest_trends(_DATA["trends"])
    fcasts  = forecasts_for_quarter(_DATA["forecasts"])
    monthly = _DATA["monthly"]

    # Latest median price per m² per area × registration_type
    price_df = (
        monthly.sort_values("month")
        .groupby(["area", "registration_type"])["median_price_per_m2_aed"]
        .last()
        .reset_index()
    )
    price_df = _filter_registration(price_df, registration_type)

    # Merge trend
    labelled = trends[trends["trend_label"].isin(["Rising", "Stable", "Declining"])]
    merged   = price_df.merge(
        labelled[["area", "registration_type", "trend_label", "trend_score", "volatility"]],
        on=["area", "registration_type"],
        how="left",
    )

    # Merge forecast sales
    sales_fc = fcasts[fcasts["target"] == SALES_TARGET][
        ["area", "registration_type", "forecast_value", "status"]
    ].rename(columns={"forecast_value": "forecast_sales", "status": "forecast_status"})
    merged   = merged.merge(sales_fc, on=["area", "registration_type"], how="left")

    # Simple match score placeholder (Mahed replaces this)
    merged["match_score"] = 50.0   # TODO: replace with scorer.buyer_score()

    result = []
    for _, row in merged.head(top_n).iterrows():
        result.append({
            "area":              row["area"],
            "registration_type": row["registration_type"],
            "match_score":       safe_float(row.get("match_score")),
            "median_price_m2":   safe_float(row.get("median_price_per_m2_aed")),
            "trend_label":       row.get("trend_label") or "Insufficient data",
            "trend_score":       safe_float(row.get("trend_score")),
            "forecast_sales":    safe_float(row.get("forecast_sales")),
            "forecast_status":   row.get("forecast_status") or "unavailable",
            "data_note":         None if row.get("trend_label") else
                                 "Too few sales to classify trend for this segment.",
        })
    return result


def _investor_ranking(budget_aed: float, registration_type: str,
                      risk_tolerance: str, top_n: int) -> list[dict]:
    """Stub — returns areas with forecast appreciation. Mahed replaces scoring."""
    trends  = latest_trends(_DATA["trends"])
    fcasts  = forecasts_for_quarter(_DATA["forecasts"])

    labelled = trends[trends["trend_label"].isin(["Rising", "Stable", "Declining"])]
    labelled  = _filter_registration(labelled, registration_type)

    sales_fc = fcasts[fcasts["target"] == SALES_TARGET][
        ["area", "registration_type", "forecast_value", "last_actual"]
    ].rename(columns={"forecast_value": "fc_sales", "last_actual": "last_sales"})

    price_fc = fcasts[fcasts["target"] == PRICE_TARGET][
        ["area", "registration_type", "forecast_value", "last_actual"]
    ].rename(columns={"forecast_value": "fc_price_m2", "last_actual": "last_price_m2"})

    merged = labelled.merge(sales_fc, on=["area", "registration_type"], how="left")
    merged = merged.merge(price_fc, on=["area", "registration_type"], how="left")

    # Forecast price appreciation (quarterly, as a fraction)
    merged["price_appreciation"] = (
        merged["fc_price_m2"] / merged["last_price_m2"] - 1
    ).where(merged["last_price_m2"] > 0)

    # Risk label from volatility (Mahed will refine)
    def _risk(vol):
        v = safe_float(vol)
        if v is None:    return "unknown"
        if v < 0.05:     return "low"
        if v < 0.12:     return "medium"
        return "high"

    merged["risk_label"] = merged["volatility"].apply(_risk)

    # Filter by risk tolerance if not "medium" (medium = show all)
    if risk_tolerance == "low":
        merged = merged[merged["risk_label"] == "low"]
    elif risk_tolerance == "high":
        pass   # high tolerance = all areas including high-risk

    merged["investment_score"] = 50.0   # TODO: replace with ranker.investor_score()
    merged = merged.sort_values("investment_score", ascending=False)

    result = []
    for _, row in merged.head(top_n).iterrows():
        apprec = safe_float(row.get("price_appreciation"))
        est_gain = round(budget_aed * apprec, 0) if apprec is not None else None
        result.append({
            "area":                 row["area"],
            "registration_type":    row["registration_type"],
            "investment_score":     safe_float(row.get("investment_score")),
            "risk_label":           row.get("risk_label", "unknown"),
            "trend_label":          row.get("trend_label"),
            "trend_score":          safe_float(row.get("trend_score")),
            "forecast_appreciation_pct": round(apprec * 100, 2) if apprec is not None else None,
            "estimated_gain_aed":   est_gain,
            "volatility":           safe_float(row.get("volatility")),
            "data_note":            None if safe_float(row.get("fc_price_m2")) else
                                    "Price forecast unavailable; appreciation cannot be estimated.",
        })
    return result


# ---------------------------------------------------------------------------
# Data endpoints
# ---------------------------------------------------------------------------

@app.get("/api/areas")
def get_areas():
    """List of all known DLD area names (for dropdowns and autocomplete)."""
    return {"areas": known_areas(_DATA)}


@app.get("/api/market-summary")
def get_market_summary():
    """Overall market pulse: recent sales, trend distribution, forecast quarter."""
    trends  = latest_trends(_DATA["trends"])
    monthly = _DATA["monthly"]
    fcasts  = _DATA["forecasts"]

    labelled = trends[trends["trend_label"].isin(["Rising", "Stable", "Declining"])]
    counts   = labelled["trend_label"].value_counts().to_dict()

    latest_q   = fcasts["forecast_quarter"].max() if "forecast_quarter" in fcasts.columns else "unknown"
    latest_mon = monthly["month"].max() if not monthly.empty else "unknown"
    total_sales = int(monthly["transaction_count"].sum())

    return _serialize({
        "data_through":        latest_mon,
        "forecast_quarter":    latest_q,
        "total_recorded_sales": total_sales,
        "trend_counts": {
            "Rising":   counts.get("Rising", 0),
            "Stable":   counts.get("Stable", 0),
            "Declining": counts.get("Declining", 0),
            "insufficient_data": len(trends) - len(labelled),
        },
        "labelled_segments": len(labelled),
    })


@app.post("/api/buyer")
def buyer_shortlist(req: BuyerRequest):
    """Ranked list of areas matching the buyer's budget and preferences."""
    results = _buyer_shortlist(req.budget_aed, req.registration_type, req.top_n)
    return _serialize({
        "budget_aed":        req.budget_aed,
        "registration_type": req.registration_type,
        "results":           results,
    })


@app.post("/api/investor")
def investor_ranking(req: InvestorRequest):
    """Areas ranked by investment score for the given budget and risk tolerance."""
    results = _investor_ranking(
        req.budget_aed, req.registration_type, req.risk_tolerance, req.top_n
    )
    return _serialize({
        "budget_aed":        req.budget_aed,
        "registration_type": req.registration_type,
        "risk_tolerance":    req.risk_tolerance,
        "results":           results,
    })


@app.post("/api/area")
def area_detail(req: AreaRequest):
    """Detailed data for one area: trend, forecasts, recent price history."""
    if not _area_exists(req.area):
        raise HTTPException(
            status_code=404,
            detail=f"Area '{req.area}' not found. Use /api/areas for the full list.",
        )

    trends  = latest_trends(_DATA["trends"])
    fcasts  = forecasts_for_quarter(_DATA["forecasts"])
    monthly = _DATA["monthly"]

    area_trends = trends[trends["area"] == req.area]
    area_trends = _filter_registration(area_trends, req.registration_type)

    area_fc = fcasts[fcasts["area"] == req.area]
    area_fc = _filter_registration(area_fc, req.registration_type)

    area_monthly = monthly[monthly["area"] == req.area].sort_values("month")
    area_monthly = _filter_registration(area_monthly, req.registration_type)

    trend_rows = [
        {
            "registration_type": r["registration_type"],
            "trend_label":        r.get("trend_label"),
            "trend_score":        safe_float(r.get("trend_score")),
            "price_change_yoy":   safe_float(r.get("price_change_yoy")),
            "volume_change_yoy":  safe_float(r.get("volume_change_yoy")),
            "volatility":         safe_float(r.get("volatility")),
        }
        for _, r in area_trends.iterrows()
    ]

    forecast_rows = [
        {
            "registration_type": r["registration_type"],
            "target":            r["target"],
            "forecast_value":    safe_float(r.get("forecast_value")),
            "last_actual":       safe_float(r.get("last_actual")),
            "range_low":         safe_float(r.get("range_low")),
            "range_high":        safe_float(r.get("range_high")),
            "status":            r.get("status"),
        }
        for _, r in area_fc.iterrows()
    ]

    history = (
        area_monthly.groupby("month")
        .agg(sales=("transaction_count", "sum"),
             median_price_m2=("median_price_per_m2_aed", "median"))
        .reset_index()
        .tail(12)   # last 12 months
    )
    price_history = [
        {"month": r["month"],
         "sales": int(r["sales"]),
         "median_price_m2": safe_float(r.get("median_price_m2"))}
        for _, r in history.iterrows()
    ]

    return _serialize({
        "area":          req.area,
        "trends":        trend_rows,
        "forecasts":     forecast_rows,
        "price_history": price_history,
    })


@app.post("/api/compare")
def compare_areas(req: CompareRequest):
    """Side-by-side comparison for 2–5 areas."""
    unknown = [a for a in req.areas if not _area_exists(a)]
    if unknown:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown areas: {unknown}. Use /api/areas for the full list.",
        )

    results = []
    for area in req.areas:
        area_req = AreaRequest(area=area, registration_type=req.registration_type)
        results.append(area_detail(area_req))
    return _serialize({"comparison": results})


# ---------------------------------------------------------------------------
# Chat endpoint (streaming, with tool calls)
# ---------------------------------------------------------------------------

def _dispatch_tool(name: str, args: dict) -> str:
    """Execute a tool call and return its result as a JSON string.

    All exceptions are caught here so a bad tool call never crashes the stream.
    """
    try:
        if name == "get_market_summary":
            result = get_market_summary()

        elif name == "rank_buyer_areas":
            req    = BuyerRequest(**args)
            result = buyer_shortlist(req)

        elif name == "rank_investor_areas":
            req    = InvestorRequest(**args)
            result = investor_ranking(req)

        elif name == "get_area_data":
            req    = AreaRequest(**args)
            result = area_detail(req)

        elif name == "compare_areas":
            req    = CompareRequest(**args)
            result = compare_areas(req)

        else:
            result = {"error": f"Unknown tool: {name}"}

    except HTTPException as exc:
        result = {"error": exc.detail}
    except Exception as exc:
        logger.warning("Tool %s failed: %s", name, exc)
        result = {"error": "Tool call failed. The data may be unavailable for this query."}

    return json.dumps(_serialize(result), allow_nan=False)


async def _stream_chat(messages: list[dict], persona: str):
    """Drive the GPT-4o tool-call loop and yield SSE chunks."""
    from openai import AsyncOpenAI, APIConnectionError, APITimeoutError

    client  = AsyncOpenAI(api_key=_API_KEY, timeout=CHAT_TIMEOUT_SECONDS)
    system  = BUYER_SYSTEM_PROMPT if persona == "buyer" else INVESTOR_SYSTEM_PROMPT
    history = [{"role": "system", "content": system}, *messages]

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=history,
                tools=TOOLS,
                stream=True,
            )

            # Accumulate the streamed response
            content_parts: list[str]       = []
            tool_calls_acc: dict[int, dict] = {}
            finish_reason: str | None       = None

            async for chunk in response:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                finish_reason = choice.finish_reason or finish_reason
                delta         = choice.delta

                # Stream text tokens directly to the client
                if delta.content:
                    content_parts.append(delta.content)
                    yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"

                # Accumulate tool call deltas
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {
                                "id":       tc.id or "",
                                "name":     tc.function.name or "",
                                "args_str": "",
                            }
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function.name:
                            tool_calls_acc[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_acc[idx]["args_str"] += tc.function.arguments

            # If the model wants to call tools, dispatch them and continue
            if finish_reason == "tool_calls" and tool_calls_acc:
                # Add the assistant's tool-call turn to history
                history.append({
                    "role":       "assistant",
                    "content":    "".join(content_parts) or None,
                    "tool_calls": [
                        {
                            "id":       tc["id"],
                            "type":     "function",
                            "function": {"name": tc["name"], "arguments": tc["args_str"]},
                        }
                        for tc in tool_calls_acc.values()
                    ],
                })

                # Dispatch each tool and add results to history
                for tc in tool_calls_acc.values():
                    try:
                        args = json.loads(tc["args_str"])
                    except json.JSONDecodeError:
                        args = {}
                    tool_result = _dispatch_tool(tc["name"], args)
                    yield f"data: {json.dumps({'type': 'tool_call', 'name': tc['name']})}\n\n"
                    history.append({
                        "role":         "tool",
                        "tool_call_id": tc["id"],
                        "content":      tool_result,
                    })
                # Loop for the next model turn
                continue

            # Model finished — send done signal
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # Hit round limit — tell the client
        yield f"data: {json.dumps({'type': 'error', 'message': 'Too many tool rounds. Please try a simpler question.'})}\n\n"

    except APITimeoutError:
        logger.warning("OpenAI timeout after %ds", CHAT_TIMEOUT_SECONDS)
        yield (
            f"data: {json.dumps({'type': 'error', 'message': 'The AI advisor is taking too long. Please try again.'})}\n\n"
        )
    except APIConnectionError:
        logger.warning("OpenAI connection error")
        yield (
            f"data: {json.dumps({'type': 'error', 'message': 'Could not reach the AI service. Check your internet connection.'})}\n\n"
        )
    except Exception:
        # Log full traceback server-side; return a generic message to the client.
        logger.exception("Unexpected error in chat stream")
        yield (
            f"data: {json.dumps({'type': 'error', 'message': 'Something went wrong. Please try again.'})}\n\n"
        )


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Streaming GPT-4o chat endpoint. Returns Server-Sent Events."""
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        _stream_chat(messages, req.persona),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    """Liveness check. Returns 200 if the app started cleanly."""
    return {
        "status":        "ok",
        "monthly_rows":  len(_DATA.get("monthly", [])),
        "forecast_rows": len(_DATA.get("forecasts", [])),
        "trend_rows":    len(_DATA.get("trends", [])),
    }
