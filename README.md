# UOWD Hackathon 2026 · Dubai Real Estate

Shared analytics for the Dubai property assistant. The data preparation, trend analysis and forecasts come from the team's existing Market Intelligence project. The source is Dubai Land Department open sales data via [Dubai Pulse / Data Dubai](https://data.dubai/en/l/470061). See [source notes](docs/official-sources.md) and [data preparation](docs/data-preparation.md).

| Output | Use |
|---|---|
| `monthly_sales.csv` | Historical transaction counts and monthly medians by area, property type, unit type and registration type |
| `market_trends.csv` | Quarterly activity, year-over-year changes and trend labels by area and registration type |
| `forecasts.csv` and `forecast_manifest.json` | Q4 2026 projections for sales count and price per square metre, with support status and ranges where available |
| `area_names.csv` and `quality_report.json` | Area aliases and snapshot coverage |

The source export was downloaded on 28 October 2026. The latest complete trend quarter is Q3 2026 and is provisional. Ready and Off-Plan are separate. Trend and forecast figures cover units and villas, grouped by area and registration type. Monthly medians describe recorded sales and cannot be combined into transaction-level medians. These exports contain historical market data.

Use Python 3.11 or newer from the repository root.

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
```

The backend and agent can load the validated snapshot with `from src.market_data import load_bundle`. It returns `monthly`, `trends`, `forecasts`, `forecast_manifest`, `quality`, and `names`. The frontend can consume those facts through the team's backend API.

Refresh the snapshot with a complete official export when needed.

```bash
python -m src.update --input data/raw/export_1.csv data/raw/export_2.csv
```
