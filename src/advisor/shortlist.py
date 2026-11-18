"""Shortlist and compare areas for a buyer, from the saved DLD-derived CSVs.

    python -m src.advisor.shortlist --budget 1500000
    python -m src.advisor.shortlist --compare "Business Bay" "Dubai Marina" --kind Apartment
    python -m src.advisor.shortlist --contrast        # two budgets with visibly different shortlists
    python -m src.advisor.shortlist --budget 1500000 --goal invest
    python -m src.advisor.shortlist --invest "JVC" --registration Ready --kind Apartment --price 950000 --costs 0.25

Every row says where its numbers come from: the sales window, the data cutoff, the trend and
forecast quarters, how many sales and rent contracts it rests on, and exactly which homes it covers.
A budget fits a segment when the segment's typical sale price falls inside a band below the budget.
The score is a transparent average of its parts, each shown in the output; a part with no evidence
counts as neutral. goal='invest' adds gross rental yield as a fifth part. Trend labels describe the
market now; they are not a prediction (Part 2 measured no link to next year's prices).
"""
import argparse
import difflib
import itertools
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .data import KINDS, MIN_RENT_CONTRACTS, ROOT, load_market

DEFAULT_WEIGHTS = {'budget_fit': 0.25, 'liquidity': 0.25, 'momentum': 0.25, 'price_outlook': 0.25}
INVEST_WEIGHTS = {'budget_fit': 0.2, 'liquidity': 0.2, 'momentum': 0.2, 'price_outlook': 0.2, 'rental_yield': 0.2}
GOALS = {'live': DEFAULT_WEIGHTS, 'invest': INVEST_WEIGHTS}
OUTLOOK_RANGE = 0.10        # a forecast price change of -10%..+10% maps to 0..1
YIELD_RANGE = (0.03, 0.09)  # gross yield of 3%..9% maps to 0..1 (roughly the 10th-90th percentile seen)
THIN_RENT = 100             # below this many new contracts a rent is usable but flagged as thin

COLUMNS = ['area', 'common_name', 'registration_type', 'property_kind', 'segment_scope',
           'price_median_aed', 'price_p25_aed', 'price_p75_aed', 'price_per_m2_median_aed',
           'median_area_m2', 'sales_count', 'enough_sales', 'window_start', 'window_end',
           'data_cutoff_date', 'trend_quarter', 'trend_label', 'trend_score', 'area_price_change_yoy',
           'forecast_quarter', 'forecast_price_status', 'forecast_price', 'forecast_price_low',
           'forecast_price_high', 'forecast_price_change', 'forecast_sales_status', 'forecast_sales',
           'rent_contracts', 'rent_median_aed', 'rent_per_m2_median_aed', 'gross_yield', 'est_annual_rent_aed',
           'years_to_repay', 'pipeline_homes', 'pipeline_homes_next_12m',
           'score', 'score_components', 'caveats']


def _scope(row):
    kind = 'Flats' if row.property_kind == 'Apartment' else 'Villas and townhouses'
    return f'{kind} sold, {row.registration_type}, {row.window_start} to {row.window_end}'


def _components(frame, min_sales, budget=None, band=None):
    """Each part is 0..1, or NaN when the evidence for it is missing."""
    out = pd.DataFrame(index=frame.index)
    if budget is not None:
        lo = band[0]
        ratio = frame.price_median_aed / budget
        out['budget_fit'] = ((ratio - lo) / (0.8 - lo)).clip(0, 1) if lo < 0.8 else 1.0
    logs = np.log(frame.sales_count.clip(lower=1))
    out['liquidity'] = logs.rank(pct=True)
    out['momentum'] = ((frame.trend_score + 1) / 2).where(frame.trend_status == 'ok')
    # Only a model forecast says something about direction; a fallback just repeats last quarter.
    out['price_outlook'] = ((frame.forecast_price_change + OUTLOOK_RANGE) / (2 * OUTLOOK_RANGE)
                            ).clip(0, 1).where(frame.forecast_price_status == 'ok')
    low, high = YIELD_RANGE
    out['rental_yield'] = ((frame.gross_yield - low) / (high - low)).clip(0, 1)
    return out


def _score(parts, weights):
    weights = {k: w for k, w in weights.items() if k in parts.columns}
    values = parts[list(weights)]
    w = pd.Series(weights)
    # A part with no evidence counts as neutral (0.5), so thin evidence never lifts a score.
    score = (values.fillna(0.5) * w).sum(axis=1) / w.sum()
    shown = values.round(3).apply(lambda row: {k: (None if pd.isna(v) else float(v)) for k, v in row.items()}, axis=1)
    return score.round(4), shown


def _caveats(row):
    notes = []
    if row.trend_status != 'ok':
        notes.append('no trend label (too few comparable sales)')
    if row.forecast_price_status != 'ok':
        notes.append('no model price forecast')
    if row.provisional:
        notes.append(f'{row.trend_quarter} is provisional (DLD still corrects recent records)')
    notes.append('trend and forecast cover all homes in the area and registration type, not only this property kind')
    if pd.isna(row.gross_yield):
        notes.append(f'no rental yield (fewer than {MIN_RENT_CONTRACTS} new rent contracts in the window)')
    else:
        notes.append('yield is gross: before service charges, vacancy, agency and DLD fees')
        if row.rent_contracts < THIN_RENT:
            notes.append(f'rent rests on only {row.rent_contracts} new contracts')
        if row.registration_type == 'Off-Plan':
            notes.append("off-plan yield uses today's rents for finished homes; no rent until handover")
    return '; '.join(notes)


def _prepare(market):
    seg = market.segments.copy()
    seg['forecast_price_change'] = (seg.forecast_price / seg.forecast_price_last_actual - 1
                                    ).where(seg.forecast_price_status.eq('ok'))
    seg['segment_scope'] = seg.apply(_scope, axis=1)
    return seg


def _finish(seg, parts, weights):
    seg = seg.copy()
    seg['score'], seg['score_components'] = _score(parts, weights)
    seg['caveats'] = seg.apply(_caveats, axis=1)
    return seg


def _weights(goal, weights):
    if goal not in GOALS:
        raise ValueError(f'goal must be one of {sorted(GOALS)}.')
    return {**GOALS[goal], **(weights or {})}


def shortlist(budget_aed, market=None, registration_type=None, property_kind=None,
              band=(0.5, 1.0), min_sales=50, top_n=10, weights=None, sort_by='score', goal='live'):
    """Segments whose typical sale price sits inside the budget band, best first.

    band=(0.5, 1.0) keeps segments priced between half the budget and the budget itself, so a
    large budget is not filled with cheap areas it could outbuy. min_sales is the number of sales
    in the window below which a price is too thin to trust. goal='invest' adds rental yield to the
    score. Returns a DataFrame with COLUMNS.
    """
    if not budget_aed or budget_aed <= 0:
        raise ValueError('Budget must be a positive amount in AED.')
    if not 0 <= band[0] < band[1]:
        raise ValueError('band must be (low, high) with 0 <= low < high, as shares of the budget.')
    if sort_by not in ('score', 'sales', 'price', 'yield'):
        raise ValueError("sort_by must be 'score', 'sales', 'price' or 'yield'.")
    weights = _weights(goal, weights)
    market = market or load_market()
    seg = _prepare(market)
    if registration_type:
        seg = seg.loc[seg.registration_type.str.casefold() == registration_type.casefold()]
    if property_kind:
        if property_kind.title() not in KINDS:
            raise ValueError(f'property_kind must be one of {KINDS}.')
        seg = seg.loc[seg.property_kind == property_kind.title()]
    seg = seg.loc[seg.sales_count >= min_sales]
    # Liquidity is ranked against every well-supported segment, not just the ones this budget keeps.
    parts = _components(seg, min_sales, budget_aed, band)
    seg = _finish(seg, parts, weights)
    seg['enough_sales'] = True
    ratio = seg.price_median_aed / budget_aed
    seg = seg.loc[(ratio >= band[0]) & (ratio <= band[1])]
    column = {'score': 'score', 'sales': 'sales_count', 'price': 'price_median_aed', 'yield': 'gross_yield'}[sort_by]
    seg = seg.sort_values([column, 'area'], ascending=[False, True], na_position='last').head(top_n)
    return seg[COLUMNS].reset_index(drop=True)


def resolve_area(name, market):
    """DLD area name or the common name people use (Marsa Dubai / Dubai Marina). Exact match only."""
    key = ' '.join(str(name).split()).casefold()
    names = market.names.dropna(subset=['common_name'])
    found = {a for a in market.segments.area.unique() if a.casefold() == key}
    for area, common in zip(names.area, names.common_name):
        if key in {part.strip().casefold() for part in str(common).split(',')}:
            found.add(area)
    if not found and market.aliases is not None:     # explicit list in data/area_search_aliases.csv
        found = {a for alias, a in zip(market.aliases.alias, market.aliases.area) if str(alias).casefold() == key}
    if len(found) == 1:
        return found.pop()
    if len(found) > 1:
        raise ValueError(f'"{name}" matches several DLD areas: {sorted(found)}. Use the DLD name.')
    pool = list(market.segments.area.unique()) + [str(c) for c in names.common_name]
    close = difflib.get_close_matches(name, pool, n=3, cutoff=0.6)
    hint = f' Did you mean: {", ".join(close)}?' if close else ''
    raise ValueError(f'No area called "{name}" in the data.{hint}')


def compare_areas(areas, market=None, registration_type=None, property_kind=None, min_sales=50, weights=None,
                  goal='live'):
    """Side-by-side rows for the named areas, one row per segment they have sales in.

    Segments with fewer than min_sales are kept but flagged enough_sales=False, never dropped,
    so a thin market is visible instead of silently missing.
    """
    market = market or load_market()
    resolved = [resolve_area(a, market) for a in areas]
    seg = _prepare(market)
    seg = seg.loc[seg.area.isin(resolved)]
    if registration_type:
        seg = seg.loc[seg.registration_type.str.casefold() == registration_type.casefold()]
    if property_kind:
        seg = seg.loc[seg.property_kind == property_kind.title()]
    reference = _prepare(market)
    reference = reference.loc[reference.sales_count >= min_sales]
    parts = _components(seg, min_sales)
    # Rank liquidity among all well-supported segments so a thin segment is not flattered.
    ranks = np.log(reference.sales_count.clip(lower=1))
    parts['liquidity'] = np.log(seg.sales_count.clip(lower=1)).apply(lambda v: (ranks <= v).mean())
    seg = _finish(seg, parts, {k: v for k, v in _weights(goal, weights).items() if k != 'budget_fit'})
    seg['enough_sales'] = seg.sales_count >= min_sales
    seg['area'] = pd.Categorical(seg.area, categories=resolved, ordered=True)
    seg = seg.sort_values(['area', 'registration_type', 'property_kind'])
    seg['area'] = seg.area.astype(str)
    return seg[COLUMNS].reset_index(drop=True)


def contrast_budgets(market=None, budgets=(750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000),
                     top_n=5, min_price_ratio=4.0, **options):
    """Compare the top-N shortlists for realistic budgets and pick a visibly different pair.

    Overlap is the share of the combined set of segments that both lists contain (Jaccard).
    A pair needs a full list for both budgets and no shared segment. Among those, the pair whose
    shortlists' median prices differ by at least min_price_ratio and whose budgets are closest
    together wins, so the difference is in the kind of home on offer, not a few per cent.
    Returns the chosen pair, every pair's overlap and each budget's shortlist.
    """
    market = market or load_market()
    lists = {b: shortlist(b, market=market, top_n=top_n, **options) for b in budgets}
    keys = {b: set(zip(df.area, df.registration_type, df.property_kind)) for b, df in lists.items()}
    pairs = []
    for low, high in itertools.combinations(sorted(budgets), 2):
        if len(lists[low]) < top_n or len(lists[high]) < top_n:
            continue
        union = keys[low] | keys[high]
        overlap = len(keys[low] & keys[high]) / len(union)
        gap = lists[high].price_median_aed.median() / lists[low].price_median_aed.median()
        pairs.append({'low_budget': low, 'high_budget': high, 'overlap': round(overlap, 3),
                      'median_price_ratio': round(float(gap), 2)})
    if not pairs:
        raise ValueError('No pair of budgets gave full shortlists; lower top_n or widen the band.')
    ranked = [p for p in pairs if p['overlap'] == 0 and p['median_price_ratio'] >= min_price_ratio]
    if not ranked:      # no pair is that far apart: fall back to the most different one found
        ranked = sorted(pairs, key=lambda p: (p['overlap'], -p['median_price_ratio']))[:1]
    best = sorted(ranked, key=lambda p: p['high_budget'] / p['low_budget'])[0]
    return {'chosen': best, 'pairs': pairs,
            'shortlists': {b: lists[b] for b in (best['low_budget'], best['high_budget'])}}


def investment_numbers(area, registration_type, property_kind, price_aed, market=None, size_m2=None,
                       running_costs_share=None):
    """An investor's numbers for one home at a given price, from real new-contract rents.

    Rent is the area's typical new-contract rent per m2 times the home's size. Without a size, the
    size is taken as price / the area's typical sale price per m2, so the yield equals the segment's.
    running_costs_share is the investor's own share of rent lost to service charges, vacancy and
    fees (for example 0.25); DLD data does not hold these, so without it only gross figures are given.
    """
    if not price_aed or price_aed <= 0:
        raise ValueError('Price must be a positive amount in AED.')
    if size_m2 is not None and size_m2 < 10:
        raise ValueError('Size must be at least 10 m2.')
    if running_costs_share is not None and not 0 <= running_costs_share < 1:
        raise ValueError('running_costs_share must be between 0 and 1, for example 0.25.')
    market = market or load_market()
    name = resolve_area(area, market)
    seg = _prepare(market)
    match = seg.loc[(seg.area == name) & (seg.registration_type.str.casefold() == str(registration_type).casefold())
                    & (seg.property_kind == str(property_kind).title())]
    if match.empty:
        raise ValueError(f'No {property_kind} {registration_type} sales in {name} in the window.')
    row = match.iloc[0]
    if row.rent_contracts < MIN_RENT_CONTRACTS or pd.isna(row.rent_per_m2_median_aed):
        raise ValueError(f'Too few new rent contracts for {property_kind} in {name} '
                         f'({row.rent_contracts}, need {MIN_RENT_CONTRACTS}) to estimate rent.')
    assumed = size_m2 is None
    size = price_aed / row.price_per_m2_median_aed if assumed else float(size_m2)
    rent = row.rent_per_m2_median_aed * size
    gross = rent / price_aed
    net_rent = None if running_costs_share is None else rent * (1 - running_costs_share)
    caveats = ['gross figures are before service charges, vacancy, agency and DLD fees']
    if assumed:
        caveats.append("size assumed from the price and the area's typical sale price per m2")
    if row.registration_type == 'Off-Plan':
        caveats.append("off-plan: rent uses today's rents for finished homes and starts only after handover")
    if row.sales_count < 50:
        caveats.append(f'only {row.sales_count} sales in the window; typical price is thin')
    if row.rent_contracts < THIN_RENT:
        caveats.append(f'rent rests on only {row.rent_contracts} new contracts')
    return {
        'area': name, 'common_name': None if pd.isna(row.common_name) else row.common_name,
        'registration_type': row.registration_type, 'property_kind': row.property_kind,
        'price_aed': float(price_aed), 'size_m2': round(size, 1), 'size_assumed': assumed,
        'price_vs_typical': round(price_aed / row.price_median_aed - 1, 4),
        'price_per_m2_aed': round(price_aed / size, 0), 'typical_price_per_m2_aed': round(row.price_per_m2_median_aed, 0),
        'annual_rent_aed': round(rent, 0), 'monthly_rent_aed': round(rent / 12, 0), 'gross_yield': round(gross, 4),
        'running_costs_share': running_costs_share,
        'net_annual_rent_aed': None if net_rent is None else round(net_rent, 0),
        'net_yield': None if net_rent is None else round(net_rent / price_aed, 4),
        'years_to_repay': round(price_aed / (net_rent if net_rent is not None else rent), 1),
        'rent_per_m2_aed': round(row.rent_per_m2_median_aed, 0), 'rent_contracts': int(row.rent_contracts),
        'sales_count': int(row.sales_count), 'window_start': row.window_start, 'window_end': row.window_end,
        'data_cutoff_date': row.data_cutoff_date, 'pipeline_homes': None if pd.isna(row.pipeline_homes) else int(row.pipeline_homes),
        'pipeline_homes_next_12m': None if pd.isna(row.pipeline_homes_next_12m) else int(row.pipeline_homes_next_12m),
        'caveats': caveats}


def _show(frame):
    cols = ['area', 'common_name', 'registration_type', 'property_kind', 'price_median_aed',
            'sales_count', 'trend_label', 'forecast_price_change', 'gross_yield', 'est_annual_rent_aed', 'score']
    pretty = frame[cols].copy()
    for col in ['price_median_aed', 'est_annual_rent_aed']:
        pretty[col] = pretty[col].round(0)
    pretty['forecast_price_change'] = (pretty.forecast_price_change * 100).round(1)
    pretty['gross_yield'] = (pretty.gross_yield * 100).round(2)
    return pretty.rename(columns={'forecast_price_change': 'fc_price_chg_%', 'gross_yield': 'yield_%',
                                  'est_annual_rent_aed': 'rent_aed'}).to_string(index=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', type=Path, default=ROOT, help='project folder holding data/shared')
    parser.add_argument('--budget', type=float)
    parser.add_argument('--registration', choices=['Ready', 'Off-Plan'])
    parser.add_argument('--kind', choices=list(KINDS))
    parser.add_argument('--top', type=int, default=10)
    parser.add_argument('--min-sales', type=int, default=50)
    parser.add_argument('--compare', nargs='+', metavar='AREA')
    parser.add_argument('--contrast', action='store_true')
    parser.add_argument('--goal', choices=sorted(GOALS), default='live', help='invest adds rental yield to the score')
    parser.add_argument('--invest', metavar='AREA', help='investor numbers for one home (needs --price, --registration, --kind)')
    parser.add_argument('--price', type=float)
    parser.add_argument('--size', type=float, help='home size in m2 (optional)')
    parser.add_argument('--costs', type=float, help="your share of rent lost to service charges, vacancy, fees, e.g. 0.25")
    parser.add_argument('--json', action='store_true', help='print rows as JSON')
    args = parser.parse_args()
    market = load_market(args.root)
    try:
        if args.invest:
            if not (args.price and args.registration and args.kind):
                parser.error('--invest needs --price, --registration and --kind')
            print(json.dumps(investment_numbers(args.invest, args.registration, args.kind, args.price, market,
                                                args.size, args.costs), indent=2))
            return
        if args.contrast:
            result = contrast_budgets(market, min_sales=args.min_sales)
            print(json.dumps({'chosen': result['chosen'], 'pairs': result['pairs']}, indent=2))
            for budget, frame in result['shortlists'].items():
                print(f'\nBudget AED {budget:,.0f}\n{_show(frame)}')
            return
        if args.compare:
            frame = compare_areas(args.compare, market, args.registration, args.kind, args.min_sales, goal=args.goal)
        elif args.budget:
            frame = shortlist(args.budget, market, args.registration, args.kind, top_n=args.top,
                              min_sales=args.min_sales, goal=args.goal)
        else:
            parser.error('give --budget, --compare or --contrast')
    except ValueError as exc:
        parser.exit(1, f'{exc}\n')
    print(frame.to_json(orient='records', indent=2) if args.json else _show(frame))
    if len(frame):
        print(f'\nSales window {frame.window_start[0]} to {frame.window_end[0]}; data cutoff '
              f'{frame.data_cutoff_date[0]}; trend {frame.trend_quarter[0]}, forecast {frame.forecast_quarter[0]}.')


if __name__ == '__main__':
    main()
