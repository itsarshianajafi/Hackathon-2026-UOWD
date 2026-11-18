"""What a buyer can buy, where, with the evidence behind it.

Builds one table of buyer segments (area + off-plan/ready + flat or villa) over the last four
complete quarters, joined with Part 2's trend label and Part 3's forecast for the same area.
Everything comes from the saved files in data/shared/; nothing is estimated or invented.
"""
from dataclasses import dataclass
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SHARED = Path('data/shared')
SALES_TARGET = 'sales_count'
PRICE_TARGET = 'weighted_geomean_monthly_median_aed_m2'
# Only homes a buyer can live in or rent out. Shops, offices, parking and hotel rooms are not.
KINDS = ('Apartment', 'Villa')
MIN_RENT_CONTRACTS = 30     # fewer new contracts in the window than this and a rent is too thin to use


def weighted_quantile(values, weights, q):
    """Smallest value whose cumulative weight reaches share q. NaN if there is nothing to weigh."""
    values = np.asarray(values, dtype=float)
    weights = np.asarray(weights, dtype=float)
    keep = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    if not keep.any():
        return float('nan')
    values, weights = values[keep], weights[keep]
    order = np.argsort(values, kind='stable')
    values, weights = values[order], weights[order]
    cumulative = np.cumsum(weights)
    return float(values[np.searchsorted(cumulative, q * cumulative[-1], side='left')])


def property_kind(frame):
    """'Apartment' for flats, 'Villa' for villas and townhouses, missing for everything else."""
    kind = pd.Series(pd.NA, index=frame.index, dtype='object')
    kind[(frame.property_type == 'Unit') & (frame.unit_type == 'Flat')] = 'Apartment'
    kind[(frame.property_type == 'Unit') & (frame.unit_type == 'Stacked Townhouses')] = 'Villa'
    kind[frame.property_type == 'Villa'] = 'Villa'      # includes villas with no subtype
    return kind


@dataclass
class Market:
    segments: pd.DataFrame
    names: pd.DataFrame
    window_start: str
    window_end: str
    data_cutoff_date: str
    origin_quarter: str
    forecast_quarter: str
    aliases: pd.DataFrame = None     # explicit short names people search with (JVC, JLT), alias -> area


def _window_months(origin, quarters):
    last = pd.Period(origin, freq='Q')
    first = last - (quarters - 1)
    return first.start_time.strftime('%Y-%m'), last.end_time.strftime('%Y-%m')


def _segment_prices(monthly):
    rows = []
    for (area, registration, kind), group in monthly.groupby(['area', 'registration_type', 'kind']):
        w = group.transaction_count
        rows.append({
            'area': area, 'registration_type': registration, 'property_kind': kind,
            'sales_count': int(w.sum()), 'months_with_sales': int(group.month.nunique()),
            'price_median_aed': weighted_quantile(group.median_price_aed, w, 0.5),
            'price_p25_aed': weighted_quantile(group.median_price_aed, w, 0.25),
            'price_p75_aed': weighted_quantile(group.median_price_aed, w, 0.75),
            'price_per_m2_median_aed': weighted_quantile(group.median_price_per_m2_aed, w, 0.5),
            'median_area_m2': weighted_quantile(group.median_area_m2, w, 0.5)})
    return pd.DataFrame(rows)


def _rents(rent_monthly, start, end):
    """New-contract rents per area and home kind over the same months as the sales window.

    New contracts show today's market rent; renewals lag behind it under Dubai's rent rules.
    """
    cols = ['area', 'property_kind', 'rent_contracts', 'rent_renewals', 'rent_median_aed', 'rent_per_m2_median_aed']
    if rent_monthly is None or rent_monthly.empty:
        return pd.DataFrame(columns=cols)
    window = rent_monthly.loc[rent_monthly.month.between(start, end)]
    renewals = (window.loc[window.contract_type == 'Renewal'].groupby(['area', 'property_kind'])
                .contract_count.sum().rename('rent_renewals'))
    rows = []
    for (area, kind), group in window.loc[window.contract_type == 'New'].groupby(['area', 'property_kind']):
        w = group.contract_count
        rows.append({'area': area, 'property_kind': kind, 'rent_contracts': int(w.sum()),
                     'rent_median_aed': weighted_quantile(group.median_annual_rent_aed, w, 0.5),
                     'rent_per_m2_median_aed': weighted_quantile(group.median_rent_per_m2_aed, w, 0.5)})
    out = pd.DataFrame(rows, columns=[c for c in cols if c != 'rent_renewals'])
    out = out.merge(renewals.reset_index(), on=['area', 'property_kind'], how='outer')
    out[['rent_contracts', 'rent_renewals']] = out[['rent_contracts', 'rent_renewals']].fillna(0).astype(int)
    return out[cols]


def investor_numbers(segments, min_rent_contracts=MIN_RENT_CONTRACTS):
    """Gross yield from rent and price per m2, so a difference in home size does not distort it.

    Annual rent for the typical home is that yield times its typical price, and years to repay is
    price over rent. All three are blank when the window has too few new rent contracts.
    """
    enough = segments.rent_contracts.ge(min_rent_contracts)
    gross = (segments.rent_per_m2_median_aed / segments.price_per_m2_median_aed).where(enough)
    return pd.DataFrame({'gross_yield': gross, 'est_annual_rent_aed': gross * segments.price_median_aed,
                         'years_to_repay': 1 / gross}, index=segments.index)


def build_market(monthly, trends, forecasts, names, manifest, quality, window_quarters=4,
                 rent_monthly=None, supply=None):
    """Pure function over already-loaded frames, so tests can pass small synthetic ones."""
    origin, target = manifest['origin_quarter'], manifest['forecast_quarter']
    start, end = _window_months(origin, window_quarters)
    monthly = monthly.assign(kind=property_kind(monthly))
    monthly = monthly.loc[monthly.kind.notna() & monthly.month.between(start, end)]
    segments = _segment_prices(monthly)

    now = trends.loc[trends.quarter == origin, [
        'area', 'registration_type', 'trend_label', 'trend_score', 'price_change_yoy',
        'status', 'provisional']].rename(columns={'status': 'trend_status',
                                                  'price_change_yoy': 'area_price_change_yoy'})
    segments = segments.merge(now, on=['area', 'registration_type'], how='left')
    segments['trend_label'] = segments.trend_label.fillna('Insufficient data')
    segments['trend_status'] = segments.trend_status.fillna('insufficient_data')
    segments['provisional'] = segments.provisional.eq(True) | segments.provisional.isna()

    for tag, name in [('price', PRICE_TARGET), ('sales', SALES_TARGET)]:
        part = forecasts.loc[forecasts.target == name, [
            'area', 'registration_type', 'status', 'forecast_value', 'range_low', 'range_high',
            'last_actual']].rename(columns={
                'status': f'forecast_{tag}_status', 'forecast_value': f'forecast_{tag}',
                'range_low': f'forecast_{tag}_low', 'range_high': f'forecast_{tag}_high',
                'last_actual': f'forecast_{tag}_last_actual'})
        segments = segments.merge(part, on=['area', 'registration_type'], how='left')
        segments[f'forecast_{tag}_status'] = segments[f'forecast_{tag}_status'].fillna('missing_input')

    segments = segments.merge(_rents(rent_monthly, start, end), on=['area', 'property_kind'], how='left')
    for col in ['rent_contracts', 'rent_renewals']:
        segments[col] = pd.to_numeric(segments[col], errors='coerce').fillna(0).astype(int)
    for col in ['rent_median_aed', 'rent_per_m2_median_aed']:
        segments[col] = pd.to_numeric(segments[col], errors='coerce')
    segments = segments.join(investor_numbers(segments))
    supply_cols = ['area', 'pipeline_homes', 'pipeline_homes_next_12m']
    supply = supply[supply_cols] if supply is not None else pd.DataFrame(columns=supply_cols)
    segments = segments.merge(supply, on='area', how='left')
    if supply is not None and len(supply):     # an area missing from the register has nothing being built
        segments[supply_cols[1:]] = segments[supply_cols[1:]].fillna(0).astype(int)

    names = names[['area', 'common_name']].drop_duplicates('area')
    segments = segments.merge(names, on='area', how='left')
    segments['window_start'], segments['window_end'] = start, end
    segments['data_cutoff_date'] = quality['date_max']
    segments['trend_quarter'], segments['forecast_quarter'] = origin, target
    return Market(segments=segments.sort_values(['area', 'registration_type', 'property_kind'])
                  .reset_index(drop=True), names=names, window_start=start, window_end=end,
                  data_cutoff_date=quality['date_max'], origin_quarter=origin, forecast_quarter=target)


def _core(root):
    """Sales, trends and forecasts. In this repository they go through the team's validated loader."""
    if Path(root).resolve() == ROOT:
        from src.market_data import load_bundle     # checks the forecast manifest hashes first
        bundle = load_bundle()
        names = pd.DataFrame(list(bundle['names'].items()), columns=['area', 'common_name'])
        return (bundle['monthly'].drop(columns='date'), bundle['trends'], bundle['forecasts'], names,
                bundle['forecast_manifest'], bundle['quality'])
    shared = Path(root) / SHARED
    names_path = shared / 'area_names.csv'
    names = pd.read_csv(names_path) if names_path.exists() else pd.DataFrame(columns=['area', 'common_name'])
    return (pd.read_csv(shared / 'monthly_sales.csv'), pd.read_csv(shared / 'market_trends.csv'),
            pd.read_csv(shared / 'forecasts.csv'), names,
            json.loads((shared / 'forecast_manifest.json').read_text()),
            json.loads((shared / 'quality_report.json').read_text()))


def load_market(root=ROOT, window_quarters=4):
    """Read the saved shared files and build the segment table."""
    shared = Path(root) / SHARED
    monthly, trends, forecasts, names, manifest, quality = _core(root)
    optional = {name: pd.read_csv(shared / f'{name}.csv') if (shared / f'{name}.csv').exists() else None
                for name in ('rent_monthly', 'supply_pipeline')}
    market = build_market(monthly, trends, forecasts, names, manifest, quality, window_quarters,
                          optional['rent_monthly'], optional['supply_pipeline'])
    aliases = Path(root) / 'data/area_search_aliases.csv'
    market.aliases = pd.read_csv(aliases) if aliases.exists() else None
    return market


def safe_float(value) -> float | None:
    """Convert a value to float, returning None for NaN, Inf, or anything non-numeric."""
    try:
        f = float(value)
        return None if not math.isfinite(f) else f
    except (TypeError, ValueError):
        return None


def load_advisor_data(root=ROOT) -> dict[str, pd.DataFrame]:
    """Return dictionary of raw DataFrames for advisor endpoints."""
    shared = Path(root) / SHARED
    missing = [name for name in ('monthly_sales.csv', 'market_trends.csv', 'forecasts.csv')
               if not (shared / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"Required data files not found: {missing}. allocation.csv is not needed."
        )
    return {
        'monthly': pd.read_csv(shared / 'monthly_sales.csv'),
        'trends': pd.read_csv(shared / 'market_trends.csv'),
        'forecasts': pd.read_csv(shared / 'forecasts.csv'),
    }


def latest_trends(trends: pd.DataFrame) -> pd.DataFrame:
    """Return only the most recent quarter's trend rows."""
    latest_q = trends["quarter"].max()
    return trends[trends["quarter"] == latest_q].copy()


def forecasts_for_quarter(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Return the latest forecast quarter's rows with ok or fallback status."""
    latest_q = forecasts["forecast_quarter"].max() if "forecast_quarter" in forecasts.columns else None
    active = forecasts[forecasts["status"].isin(["ok", "fallback"])]
    if latest_q:
        active = active[active["forecast_quarter"] == latest_q]
    return active.copy()


def known_areas(data: dict[str, pd.DataFrame]) -> list[str]:
    """Sorted list of all areas that appear in at least one source file."""
    all_areas = set(data["monthly"]["area"].unique())
    return sorted(all_areas)
