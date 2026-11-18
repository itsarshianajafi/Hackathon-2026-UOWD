"""Write src/data/areas.json (forecast and trend per area segment) and src/data/listings.json.

    python scripts/export_areas.py --repo <path to the data branch checkout>

Listings are synthetic: real area names and each segment's real price per m2 (last quarter, flats and villas),
with sizes and a +/-10% spread drawn from a fixed seed. They stand in for a listings feed the hackathon data lacks.
"""
import argparse
import json
import random
import sys
from pathlib import Path

import pandas as pd

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--repo', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.repo.resolve()))
from src.market_data import load_bundle  # noqa: E402
from src.advisor.shortlist import MIN_RENT_CONTRACTS, _prepare, load_market  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / 'src/data'
b = load_bundle()
f, t, names = b['forecasts'], b['trends'], b['names']
latest = b['forecast_manifest']['origin_quarter']
num = lambda v: None if pd.isna(v) else float(v)

sales = f[f.target.eq('sales_count')].set_index(['area', 'registration_type'])
price = f[f.target.eq('weighted_geomean_monthly_median_aed_m2')].set_index(['area', 'registration_type'])
trend = t[t.quarter.eq(latest)].set_index(['area', 'registration_type'])
areas = []
for key, s in sales[sales.status.eq('ok')].iterrows():
    p = price.loc[key] if key in price.index else None
    tr = trend.loc[key] if key in trend.index else None
    areas.append({
        'area': key[0], 'name': names.get(key[0], key[0]), 'registration': key[1],
        'forecast_sales': float(s.forecast_value), 'last_sales': num(s.last_actual),
        'sales_change': float(s.forecast_value / s.last_actual - 1) if s.last_actual and s.last_actual > 0 else None,
        'price_m2_last': None if p is None else num(p.last_actual),
        'price_m2_forecast': None if p is None or p.status != 'ok' else num(p.forecast_value),
        'trend': None if tr is None or tr.status != 'ok' else tr.trend_label,
    })
seg = _prepare(load_market())
rents = {(r.area, r.registration_type, r.property_kind): r for r in seg.itertuples()
         if r.rent_contracts >= MIN_RENT_CONTRACTS and pd.notna(r.rent_per_m2_median_aed)}
supply = seg.groupby('area').pipeline_homes_next_12m.max()
for a in areas:
    flat = rents.get((a['area'], a['registration'], 'Apartment'))
    a['gross_yield_apartment'] = None if flat is None else float(flat.rent_per_m2_median_aed / flat.price_per_m2_median_aed)
    a['pipeline_homes_next_12m'] = None if pd.isna(supply.get(a['area'])) else int(supply.get(a['area']))
    a['price_change'] = (a['price_m2_forecast'] / a['price_m2_last'] - 1) if a['price_m2_forecast'] and a['price_m2_last'] else None
areas.sort(key=lambda a: -a['forecast_sales'])

rng = random.Random(2026)
SIZES = {0: 38, 1: 72, 2: 115, 3: 165, 4: 240}
KINDS = {0: 'Studio', 1: '1-bed apartment', 2: '2-bed apartment', 3: '3-bed apartment', 4: '4-bed villa'}
listings = []
for a in areas:
    if not a['price_m2_last']:
        continue
    for beds in rng.sample(range(5), 3):
        size = round(SIZES[beds] * rng.uniform(0.85, 1.15))
        per_m2 = a['price_m2_last'] * rng.uniform(0.9, 1.1)
        listings.append({
            'id': f'L{len(listings) + 1:03d}', 'synthetic': True,
            'title': f"{KINDS[beds]} in {a['name']}", 'area': a['area'], 'name': a['name'],
            'registration': a['registration'], 'beds': beds, 'size_m2': size,
            'price_aed': round(size * per_m2, -3), 'price_m2_aed': round(per_m2),
            'area_trend': a['trend'],
            'kind': 'Villa' if beds == 4 else 'Apartment',
        })
        rent = rents.get((a['area'], a['registration'], listings[-1]['kind']))
        listings[-1]['rent_per_m2_aed'] = None if rent is None else round(float(rent.rent_per_m2_median_aed), 1)
        listings[-1]['rent_contracts'] = None if rent is None else int(rent.rent_contracts)
        listings[-1]['annual_rent_aed'] = None if rent is None else round(float(rent.rent_per_m2_median_aed) * size, -2)
        listings[-1]['gross_yield'] = None if rent is None else round(listings[-1]['annual_rent_aed'] / listings[-1]['price_aed'], 4)
meta = {'rent_window': [str(seg.window_start.iloc[0]), str(seg.window_end.iloc[0])], 'quarter': latest, 'forecast_quarter': b['forecast_manifest']['forecast_quarter'], 'data_to': b['quality']['date_max']}
(OUT / 'areas.json').write_text(json.dumps({**meta, 'rows': areas}, indent=1, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
(OUT / 'listings.json').write_text(json.dumps({**meta, 'rows': listings}, indent=1, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
print(len(areas), 'area segments,', len(listings), 'listings')
