"""Write src/data/kpi.json from the team's market snapshot (Hackathon-2026-UOWD, branch `data`).

    python scripts/export_kpi.py --repo <path to the data branch checkout>

Every figure comes from src.market_data.load_bundle, which checks the snapshot's hashes first.
Forecasts cover units and villas in segments with an `ok` forecast; a segment is one area, off-plan or ready.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--repo', type=Path, required=True)
parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'src/data/kpi.json')
args = parser.parse_args()
sys.path.insert(0, str(args.repo.resolve()))
from src.market_data import load_bundle  # noqa: E402

b = load_bundle()
monthly, trends, forecasts, manifest, names = b['monthly'], b['trends'], b['forecasts'], b['forecast_manifest'], b['names']
latest = manifest['origin_quarter']
year_ago = str(pd.Period(latest, freq='Q') - 4)
scope = forecasts.property_scope.iloc[0].split('|')
quarter = pd.PeriodIndex(monthly.month, freq='Q').astype(str)
sales = monthly.groupby([quarter, 'registration_type']).transaction_count.sum().unstack(fill_value=0)

homes = monthly[monthly.property_type.isin(scope) & monthly.median_price_per_m2_aed.gt(0)].copy()
homes['quarter'] = pd.PeriodIndex(homes.month, freq='Q').astype(str)
homes['weighted'] = np.log(homes.median_price_per_m2_aed) * homes.transaction_count


def price(q, registration=None):
    """Sales-weighted geometric mean of monthly medians, the measure Part 3 forecasts."""
    rows = homes[homes.quarter.eq(q)]
    if registration:
        rows = rows[rows.registration_type.eq(registration)]
    return float(np.exp(rows.weighted.sum() / rows.transaction_count.sum()))


ok = forecasts[forecasts.target.eq('sales_count') & forecasts.status.eq('ok')]
labelled = trends[trends.quarter.eq(latest) & trends.status.eq('ok')]
out = {
    'data_to': b['quality']['date_max'],
    'latest_quarter': latest,
    'forecast_quarter': manifest['forecast_quarter'],
    'sales_latest': int(sales.loc[latest].sum()),
    'sales_year_ago': int(sales.loc[year_ago].sum()),
    'sales_offplan_latest': int(sales.loc[latest, 'Off-Plan']),
    'sales_ready_latest': int(sales.loc[latest, 'Ready']),
    'forecast_sales': float(ok.forecast_value.sum()),
    'forecast_last_quarter': float(ok.last_actual.sum()),
    'forecast_segments': int(len(ok)),
    'price_latest': price(latest),
    'price_year_ago': price(year_ago),
    'price_latest_offplan': price(latest, 'Off-Plan'),
    'price_latest_ready': price(latest, 'Ready'),
    'trend_counts': {label: int(labelled.trend_label.eq(label).sum()) for label in ['Rising', 'Stable', 'Declining']},
    'segments_labelled': int(len(labelled)),
    'rising_areas': sorted({names.get(area, area) for area in labelled[labelled.trend_label.eq('Rising')].area}),
}
cutoff = pd.Period(b['quality']['date_max'][:7], freq='M')
months = monthly[monthly.month < str(cutoff)].groupby(['month', 'registration_type']).transaction_count.sum().unstack(fill_value=0).tail(24)
out['monthly_sales'] = [{'month': m, 'offplan': int(r['Off-Plan']), 'ready': int(r['Ready'])} for m, r in months.iterrows()]
quarters = sorted(homes.quarter[homes.quarter <= latest].unique())[-8:]
out['price_quarters'] = [{'quarter': q, 'offplan': price(q, 'Off-Plan'), 'ready': price(q, 'Ready')} for q in quarters]
out['sales_change'] = out['sales_latest'] / out['sales_year_ago'] - 1
out['forecast_change'] = out['forecast_sales'] / out['forecast_last_quarter'] - 1
out['price_change'] = out['price_latest'] / out['price_year_ago'] - 1
out['offplan_share'] = out['sales_offplan_latest'] / out['sales_latest']
args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
print(json.dumps(out, indent=2, ensure_ascii=False))
