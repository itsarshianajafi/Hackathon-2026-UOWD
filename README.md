# UOWD Hackathon 2026 · Dubai Real Estate

Estaro AI, a Dubai property assistant for buyers and investors, and the shared analytics behind it. The data preparation, trend analysis and forecasts come from the team's existing Market Intelligence project.

## Repository layout

| Path | What it is |
|---|---|
| `web/` | Estaro web app (Next.js): landing page at `/`, investor and buyer dashboards at `/dashboard`, and the agent that searches listings, matches buyers and books viewings |
| `src/` | Python data pipeline: DLD data preparation, trends, forecasts and the advisor (`src/advisor/`, including a FastAPI backend) |
| `data/`, `reports/` | Processed snapshot and evaluation reports |
| `tests/` | Python tests |

## Running the project

You need Node.js 20.9 or newer for the web app and Python 3.11 or newer for the pipeline.

### Web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. The dashboards read JSON snapshots that are committed in `web/src/data/`, so the pages work without Python.

The Estaro chat needs an OpenAI key. Create `web/.env.local`:

```
OPENAI_API_KEY=sk-...
ESTARO_MODEL=gpt-4.1-mini
```

`ESTARO_MODEL` is optional and defaults to `gpt-4.1-mini`. Booked viewings are kept in memory and reset when the server restarts.

For a production build, run `npm run build` and then `npm start`.

### Data pipeline and tests

From the repository root:

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
```

### Advisor API (optional)

The FastAPI backend in `src/advisor/api.py` reads `OPENAI_API_KEY` from the environment and refuses to start without it. It does not read `.env` files, so set the variable in your shell first.

```bash
export OPENAI_API_KEY=sk-...        # PowerShell: $env:OPENAI_API_KEY="sk-..."
uvicorn src.advisor.api:app --reload --port 8700
```

The web app does not call this API yet. It has its own agent route.

### Refreshing the web app's data

After the snapshot changes, regenerate the web app's JSON from the pipeline:

```bash
cd web
python scripts/export_kpi.py --repo ..
python scripts/export_areas.py --repo ..
```

## Data The source is Dubai Land Department open sales data via [Dubai Pulse / Data Dubai](https://data.dubai/en/l/470061). See [source notes](docs/official-sources.md) and [data preparation](docs/data-preparation.md).

| Output | Use |
|---|---|
| `monthly_sales.csv` | Historical transaction counts and monthly medians by area, property type, unit type and registration type |
| `market_trends.csv` | Quarterly activity, year-over-year changes and trend labels by area and registration type |
| `forecasts.csv` and `forecast_manifest.json` | Q4 2026 projections for sales count and price per square metre, with support status and ranges where available |
| `area_names.csv` and `quality_report.json` | Area aliases and snapshot coverage |

The source export was downloaded on 28 October 2026. The latest complete trend quarter is Q3 2026 and is provisional. Ready and Off-Plan are separate. Trend and forecast figures cover units and villas, grouped by area and registration type. Monthly medians describe recorded sales and cannot be combined into transaction-level medians. These exports contain historical market data.

The backend and agent can load the validated snapshot with `from src.market_data import load_bundle`. It returns `monthly`, `trends`, `forecasts`, `forecast_manifest`, `quality`, and `names`. The frontend can consume those facts through the team's backend API.

## Shortlist, compare and investor numbers

`src/advisor/` turns the snapshot into buyer and investor answers. Every row returns its source dates,
sales and rent-contract counts, segment scope (area, Ready or Off-Plan, flat or villa) and prices.

```python
from src.advisor.shortlist import shortlist, compare_areas, investment_numbers
shortlist(1_500_000)                                   # buyer: typical price 50-100% of the budget
shortlist(1_500_000, goal='invest')                    # investor: adds gross rental yield to the score
compare_areas(['Dubai Marina', 'JVC'], property_kind='Apartment')
investment_numbers('JVC', 'Ready', 'Apartment', 950_000, running_costs_share=0.25)
```

AED 1M and AED 5M give top-5 shortlists with nothing in common (`reports/advisor/budget_contrast.md`).
Rents come from DLD Ejari rent contracts (`rent_monthly.csv`, new single-home contracts) and upcoming
supply from DLD's project register (`supply_pipeline.csv`). Both are cleaned summaries; the raw exports stay
out of Git. Rebuild them with `python -m src.dld_data.rents --input <rent csv parts>` and
`python -m src.dld_data.supply --input <projects xlsx> --as-of <sales cutoff>`. Method and limits:
[src/advisor/NOTES.md](src/advisor/NOTES.md).

Refresh the snapshot with a complete official export when needed.

```bash
python -m src.update --input data/raw/export_1.csv data/raw/export_2.csv
```
