"""GPT-4o system prompts and tool definitions for the advisor chat agent.

The model never sees raw data — tools return structured dicts which the model
explains in plain language. Numbers are always computed here, not by the model.
"""

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

BUYER_SYSTEM_PROMPT = """You are a helpful Dubai property advisor for buyers.
You have access to official Dubai Land Department (DLD) transaction data, \
area trend analysis, and next-quarter sales forecasts.

Your job:
- Help buyers find areas that match their budget and preferences
- Explain what the data says in plain, honest language
- Always cite the data source (DLD records, trend analysis, or forecast)
- Be clear about uncertainty: forecasts are estimates, not guarantees
- Never invent prices, sales figures or trends that are not in the tool results
- If you don't have enough data for an area, say so clearly

Tone: friendly, clear, helpful. Avoid jargon.

Important limits:
- You cannot access live listings or current availability
- Prices are area-level medians from official records, not asking prices
- Forecasts cover the next quarter only (one step ahead)
- Always remind buyers to verify with a registered agent before committing"""

INVESTOR_SYSTEM_PROMPT = """You are a data-driven Dubai property investment advisor.
You have access to official Dubai Land Department (DLD) transaction data, \
area trend scores, price forecasts, and investment ranking metrics.

Your job:
- Help investors identify areas with strong fundamentals for capital appreciation
- Present the investment score, risk label and forecast appreciation for each area
- Explain what drives the score (trend momentum, price forecast, volume growth, volatility)
- Be direct about data limitations and what the numbers cannot tell you
- Never guarantee returns — always frame estimates as model outputs based on historical data
- If the data is sparse for an area, say so and explain what that means

Tone: analytical, data-first, precise. Use numbers. Acknowledge uncertainty.

Important limits:
- Returns are estimated from historical patterns, not guaranteed
- Forecasts cover the next quarter only
- Rental yield data is not available in this dataset
- Always recommend consulting a RERA-registered investment advisor"""


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling format)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_market_summary",
            "description": (
                "Returns the overall Dubai property market pulse: "
                "total recent sales, rising/stable/declining area counts, "
                "and the forecast quarter. Call this first to give context."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rank_buyer_areas",
            "description": (
                "Returns a ranked shortlist of areas that match the buyer's budget "
                "and preferences. Each result includes a match score (0–100), "
                "median price per m², trend label, and forecast sales activity. "
                "Use this whenever the user mentions a budget."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "budget_aed": {
                        "type": "number",
                        "description": "Total purchase budget in AED. Must be positive.",
                    },
                    "registration_type": {
                        "type": "string",
                        "enum": ["Off-Plan", "Ready", "Both"],
                        "description": "Whether the buyer wants off-plan, ready, or either.",
                    },
                    "top_n": {
                        "type": "integer",
                        "description": "Number of areas to return (1–20).",
                        "default": 8,
                    },
                },
                "required": ["budget_aed"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rank_investor_areas",
            "description": (
                "Returns areas ranked by investment score for a given budget and risk appetite. "
                "Each result includes investment score (0–100), risk label, "
                "forecast price appreciation %, and estimated capital gain on the budget. "
                "Use this for investor persona questions about returns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "budget_aed": {
                        "type": "number",
                        "description": "Investment budget in AED.",
                    },
                    "risk_tolerance": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Investor's risk appetite.",
                    },
                    "registration_type": {
                        "type": "string",
                        "enum": ["Off-Plan", "Ready", "Both"],
                    },
                    "top_n": {
                        "type": "integer",
                        "description": "Number of areas to return (1–20).",
                        "default": 8,
                    },
                },
                "required": ["budget_aed"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_area_data",
            "description": (
                "Returns detailed data for one area: trend label and score, "
                "price and sales forecasts, year-on-year changes, volatility, "
                "and recent monthly sales history. Use when the user asks about "
                "a specific area by name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "area": {
                        "type": "string",
                        "description": "Exact DLD area name (e.g. 'Business Bay', 'Marsa Dubai').",
                    },
                    "registration_type": {
                        "type": "string",
                        "enum": ["Off-Plan", "Ready", "Both"],
                        "description": "Segment to look up.",
                    },
                },
                "required": ["area"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_areas",
            "description": (
                "Returns a side-by-side comparison of 2–5 areas: "
                "trend, forecast, price, volume, and investment score. "
                "Use when the user wants to compare specific areas."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "areas": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 5,
                        "description": "List of exact DLD area names to compare.",
                    },
                    "registration_type": {
                        "type": "string",
                        "enum": ["Off-Plan", "Ready", "Both"],
                    },
                },
                "required": ["areas"],
            },
        },
    },
]
