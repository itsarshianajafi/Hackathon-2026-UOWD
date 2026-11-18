# Advisor notes (Mahed): shortlist, compare and investor numbers

The data and trend logic behind the buyer and investor advisor. Every function reads the saved files in
`data/shared/` and returns where each number comes from.

## Commands

```bash
# Build the investor inputs once from DLD exports (they are kept out of Git, like the sales exports)
python -m src.dld_data.rents --input data/raw/rent_contracts_0001.csv data/raw/rent_contracts_0002.csv
python -m src.dld_data.supply --input data/raw/projects_0001.xlsx --as-of 2026-10-27

python -m src.advisor.shortlist --budget 1500000                    # buyer who will live there
python -m src.advisor.shortlist --budget 1500000 --goal invest      # adds rental yield to the score
python -m src.advisor.shortlist --compare "Dubai Marina" JVC --kind Apartment
python -m src.advisor.shortlist --invest JVC --registration Ready --kind Apartment --price 950000 --costs 0.25
python -m src.advisor.make_report                                   # reports/advisor/budget_contrast.md
python -m unittest tests.test_advisor tests.test_investor
```

## Functions (`src/advisor/shortlist.py`)

| Function | Returns |
|---|---|
| `shortlist(budget, goal='live' or 'invest', ...)` | Segments whose typical price is 50-100% of the budget, best first |
| `compare_areas([...])` | One row per segment of the named areas; thin segments flagged, never dropped |
| `investment_numbers(area, registration, kind, price, size_m2=None, running_costs_share=None)` | Rent, gross and net yield, years to repay for one home |
| `contrast_budgets()` | Two budgets whose shortlists share nothing (AED 1M and AED 5M) |

Every row carries the sales window, data cutoff, trend and forecast quarters, sales and rent-contract counts,
the exact segment scope, prices, the score with its parts, and caveats.

## Data files

| File | From | What |
|---|---|---|
| `monthly_sales.csv`, `market_trends.csv`, `forecasts.csv` | Parts 1-3 | Prices, trend labels, forecasts |
| `rent_monthly.csv`, `rent_quality_report.json` | DLD rent contracts (Ejari) | Monthly rent medians per area, flat/villa, new/renewal |
| `supply_pipeline.csv`, `supply_report.json` | DLD project register | Homes in active projects under 100% complete, per area |
| `data/area_search_aliases.csv` | Hand-written | Short names people search with (JVC, JLT, DWC); exact match only |

## Decisions

- **Segment** = area + off-plan/ready + flat or villa/townhouse. Shops, offices, parking and hotel rooms are
  excluded although Part 1 files them under "Unit".
- **Window** = the last four complete quarters (2025-10 to 2026-09), the same for sales and rents.
- **Typical price** = sales-weighted median of monthly median prices. At least 50 sales in the window.
- **Rents** use only single-home residential contracts (multi-property contracts have one amount for several
  homes) and only **new** contracts, because renewals lag the market under Dubai's rent rules. At least 30
  new contracts in the window; under 100 is flagged as thin.
- **Gross yield** = rent per m2 / sale price per m2, so a different home size in the rent and sale records does
  not distort it. Typical rent = yield x typical price; years to repay = 1 / yield.
- **Score** = average of budget fit, liquidity, momentum and price outlook (plus rental yield for investors).
  A part with no evidence counts as neutral 0.5, so thin evidence never lifts a score.
- **Supply** is shown as context only; nothing showed it predicts rents, so it does not change the score.

## Checks against the raw files

- Four headline sale numbers (Business Bay, Marina, Palm Jumeirah, Emirates Living) recomputed from the monthly
  file by expanding counts: identical.
- Rent contract counts for JVC (3,431), Marina (2,037) and Palm Jumeirah villas (33) recomputed from the raw
  rent CSVs: identical. Rent per m2 is within about 2% of a pooled median for large segments; Palm villas
  differ by about 20% (33 contracts over 12 months), which is why under 100 contracts is flagged.

## Limits

- No bedroom counts in the sales file. Rents have bedrooms, but yields need both sides.
- Ejari `actual_area` and DLD sale `procedure_area` may be measured differently; this is not verified.
- This rent export has about 220k contracts a year, below DLD's published totals; it may not be every contract.
- Gross figures only, unless the investor supplies their own running-cost share.
- The building register (`buildings_*.csv`) is not used yet: it has no prices or rents to join on.
