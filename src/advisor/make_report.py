"""Write the two-budget contrast to reports/advisor/ so the team can quote it and rerun it.

    python -m src.advisor.make_report
"""
import json
from pathlib import Path

from .data import ROOT, load_market
from .shortlist import contrast_budgets

OUT = Path('reports/advisor')


def money(value):
    return f'{value:,.0f}'


def table(frame):
    lines = ['| Area | Known as | Registration | Home | Typical price (AED) | Sales in window | Trend | Forecast price change | Gross yield | Rent (AED/yr) | Score |',
             '|---|---|---|---|---:|---:|---|---:|---:|---:|---:|']
    for r in frame.itertuples():
        change = 'n/a' if r.forecast_price_change != r.forecast_price_change else f'{r.forecast_price_change:+.1%}'
        known = '' if r.common_name != r.common_name else r.common_name
        gross = 'n/a' if r.gross_yield != r.gross_yield else f'{r.gross_yield:.1%}'
        rent = 'n/a' if r.est_annual_rent_aed != r.est_annual_rent_aed else money(r.est_annual_rent_aed)
        lines.append(f'| {r.area} | {known} | {r.registration_type} | {r.property_kind} | {money(r.price_median_aed)} | '
                     f'{r.sales_count:,} | {r.trend_label} | {change} | {gross} | {rent} | {r.score:.2f} |')
    return '\n'.join(lines)


def main(root=ROOT):
    market = load_market(root)
    result = contrast_budgets(market)
    chosen = result['chosen']
    low, high = chosen['low_budget'], chosen['high_budget']
    out = Path(root) / OUT
    out.mkdir(parents=True, exist_ok=True)
    payload = {'chosen': chosen, 'pairs': result['pairs'],
               'sources': {'sales_window': f'{market.window_start} to {market.window_end}',
                           'data_cutoff_date': market.data_cutoff_date, 'trend_quarter': market.origin_quarter,
                           'forecast_quarter': market.forecast_quarter},
               'shortlists': {str(b): df.to_dict(orient='records') for b, df in result['shortlists'].items()}}
    (out / 'budget_contrast.json').write_text(json.dumps(payload, indent=2, default=str) + '\n')
    text = f"""# Two budgets, two different shortlists

Budgets compared: **AED {money(low)}** and **AED {money(high)}**. The two top-5 shortlists share
{round(chosen['overlap'] * 100)}% of their segments, and the median typical price differs by
{chosen['median_price_ratio']}x.

Sources: DLD sales window {market.window_start} to {market.window_end}; data cutoff {market.data_cutoff_date};
trend for {market.origin_quarter}; forecast for {market.forecast_quarter}. A segment is an area, off-plan or
ready, and flats or villas/townhouses. Each needs at least 50 sales in the window and a typical sale price
between half the budget and the budget.

## Budget AED {money(low)}

{table(result['shortlists'][low])}

## Budget AED {money(high)}

{table(result['shortlists'][high])}

## How to read this
- Typical price is the sales-weighted median of each month's median sale price, not a pooled transaction median.
- Trend labels describe the market now; they are not a prediction. Part 2 found no link to next year's prices.
- Forecast price change compares Part 3's model forecast with the last quarter. It is blank when only a fallback
  forecast exists. Trend and forecast cover every home in that area and registration type, not only this kind.
- Gross yield is the area's typical new-contract rent per m2 over its typical sale price per m2 (DLD Ejari
  contracts starting in the same window). It is before service charges, vacancy and fees. Off-plan yields use
  today's rents for finished homes. Rent for the typical home is that yield times its typical price.
- The sales file has no bedroom counts, so shortlists cannot be filtered by bedrooms.
- 2026Q3 is provisional: DLD still corrects recent records.
"""
    (out / 'budget_contrast.md').write_text(text)
    return chosen


if __name__ == '__main__':
    print(json.dumps(main(), indent=2))
