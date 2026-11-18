"""Shortlist and compare checks on small synthetic data, plus a check on the shared files."""
from pathlib import Path
import unittest

import numpy as np
import pandas as pd

from src.advisor.data import ROOT, build_market, load_market, property_kind, weighted_quantile
from src.advisor.shortlist import COLUMNS, compare_areas, contrast_budgets, resolve_area, shortlist

MONTHS = list(pd.period_range('2025-10', '2026-09', freq='M').strftime('%Y-%m'))
MANIFEST = {'origin_quarter': '2026Q3', 'forecast_quarter': '2026Q4'}
QUALITY = {'date_max': '2026-10-27'}


def cells(area, registration, prop, unit, price, total_sales, months=MONTHS, per_m2=15000.0):
    each = total_sales // len(months)
    return [{'area': area, 'property_type': prop, 'unit_type': unit, 'registration_type': registration,
             'month': m, 'transaction_count': each, 'total_price_aed': price * each, 'median_price_aed': price,
             'median_area_m2': 80.0, 'median_price_per_m2_aed': per_m2} for m in months]


def trend(area, registration, score, status='ok'):
    return {'area': area, 'registration_type': registration, 'quarter': '2026Q3', 'trend_label': 'Stable',
            'trend_score': score, 'price_change_yoy': 0.05, 'status': status, 'provisional': True}


def forecast(area, registration, target, status, value=None, last=None):
    return {'area': area, 'registration_type': registration, 'target': target, 'status': status,
            'forecast_value': value, 'range_low': None if value is None else value * 0.9,
            'range_high': None if value is None else value * 1.1, 'last_actual': last}


PRICE = 'weighted_geomean_monthly_median_aed_m2'


def synthetic_market():
    rows = (cells('Alpha', 'Ready', 'Unit', 'Flat', 800_000, 120)
            + cells('Alpha', 'Ready', 'Unit', 'Shop', 3_000_000, 600)          # not a home
            + cells('Alpha', 'Ready', 'Villa', None, 3_000_000, 60)
            + cells('Alpha', 'Ready', 'Unit', 'Flat', 10_000_000, 12, months=['2025-09'])   # outside window
            + cells('Beta', 'Ready', 'Unit', 'Flat', 700_000, 24)               # too few sales
            + cells('Gamma', 'Ready', 'Unit', 'Flat', 900_000, 120)             # no trend, no forecast
            + cells('Delta', 'Ready', 'Unit', 'Flat', 900_000, 120)             # rising, fallback price
            + cells('Epsilon', 'Off-Plan', 'Unit', 'Flat', 1_500_000, 120))
    trends = pd.DataFrame([trend('Alpha', 'Ready', 0.5), trend('Delta', 'Ready', 0.9),
                           trend('Epsilon', 'Off-Plan', 0.0)])
    forecasts = pd.DataFrame([
        forecast('Alpha', 'Ready', PRICE, 'ok', 21_000, 20_000),
        forecast('Delta', 'Ready', PRICE, 'fallback', 20_000, 20_000)])
    names = pd.DataFrame({'area': ['Alpha', 'Delta', 'Gamma'],
                          'common_name': ['Alpha Heights, Alpha Park', 'Shared Name', 'Shared Name']})
    return build_market(pd.DataFrame(rows), trends, forecasts, names, MANIFEST, QUALITY)


class TestData(unittest.TestCase):
    def test_weighted_quantile(self):
        self.assertEqual(weighted_quantile([1, 2, 3], [1, 1, 1], 0.5), 2)
        self.assertEqual(weighted_quantile([1, 100], [9, 1], 0.5), 1)
        self.assertTrue(np.isnan(weighted_quantile([np.nan], [1], 0.5)))

    def test_only_homes_are_kept(self):
        frame = pd.DataFrame({'property_type': ['Unit', 'Unit', 'Unit', 'Unit', 'Villa', 'Villa', 'Land'],
                              'unit_type': ['Flat', 'Shop', 'Office', 'Parking', None, 'Villa', None]})
        kind = property_kind(frame)
        self.assertEqual(kind.fillna('-').tolist(), ['Apartment', '-', '-', '-', 'Villa', 'Villa', '-'])

    def test_window_sales_and_scope(self):
        seg = synthetic_market().segments
        alpha = seg[(seg.area == 'Alpha') & (seg.registration_type == 'Ready')].set_index('property_kind')
        self.assertEqual(alpha.loc['Apartment', 'sales_count'], 120)     # the 2025-09 sales and shops are out
        self.assertEqual(alpha.loc['Villa', 'sales_count'], 60)
        self.assertEqual(alpha.loc['Apartment', 'price_median_aed'], 800_000)
        self.assertEqual((alpha.window_start.iloc[0], alpha.window_end.iloc[0]), ('2025-10', '2026-09'))
        self.assertEqual(alpha.data_cutoff_date.iloc[0], '2026-10-27')


class TestShortlist(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.market = synthetic_market()

    def test_budget_band_and_minimum_sales(self):
        result = shortlist(1_000_000, self.market)
        self.assertTrue(result.price_median_aed.between(500_000, 1_000_000).all())
        self.assertNotIn('Beta', set(result.area))                       # 24 sales < 50
        self.assertNotIn('Epsilon', set(result.area))                    # 1.5M is above the budget
        self.assertEqual(set(result.area), {'Alpha', 'Gamma', 'Delta'})

    def test_output_carries_sources_counts_scope_and_prices(self):
        result = shortlist(1_000_000, self.market)
        self.assertEqual(list(result.columns), COLUMNS)
        row = result[result.area == 'Alpha'].iloc[0]
        self.assertEqual(row.sales_count, 120)
        self.assertIn('Flats sold, Ready, 2025-10 to 2026-09', row.segment_scope)
        self.assertEqual((row.window_start, row.window_end, row.data_cutoff_date), ('2025-10', '2026-09', '2026-10-27'))
        self.assertEqual((row.trend_quarter, row.forecast_quarter), ('2026Q3', '2026Q4'))
        self.assertAlmostEqual(row.forecast_price_change, 0.05)
        self.assertEqual(row.common_name, 'Alpha Heights, Alpha Park')
        self.assertTrue(set(row.score_components) == {'budget_fit', 'liquidity', 'momentum', 'price_outlook'})

    def test_different_budgets_give_different_lists(self):
        low = set(shortlist(1_000_000, self.market).area)
        high = set(shortlist(2_000_000, self.market).area)
        self.assertEqual(high, {'Epsilon'})
        self.assertTrue(low.isdisjoint(high))

    def test_fallback_forecast_gives_no_outlook(self):
        row = shortlist(1_000_000, self.market).set_index('area').loc['Delta']
        self.assertTrue(np.isnan(row.forecast_price_change))
        self.assertIsNone(row.score_components['price_outlook'])

    def test_missing_evidence_never_beats_good_evidence(self):
        result = shortlist(1_000_000, self.market).set_index('area')
        # Gamma (no trend, no forecast) and Delta (rising trend) have the same price and sales.
        self.assertLess(result.loc['Gamma', 'score'], result.loc['Delta', 'score'])
        self.assertIn('no trend label', result.loc['Gamma', 'caveats'])

    def test_sorted_best_first(self):
        scores = shortlist(1_000_000, self.market).score.tolist()
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_filters_and_bad_input(self):
        self.assertTrue((shortlist(5_000_000, self.market, property_kind='Villa').property_kind == 'Villa').all())
        self.assertEqual(set(shortlist(2_000_000, self.market, registration_type='ready').registration_type), set())
        for bad in (0, -5, None):
            with self.assertRaises(ValueError):
                shortlist(bad, self.market)
        with self.assertRaises(ValueError):
            shortlist(1_000_000, self.market, property_kind='Castle')


class TestCompare(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.market = synthetic_market()

    def test_thin_segments_are_flagged_not_dropped(self):
        beta = compare_areas(['Alpha', 'Beta'], self.market, property_kind='Apartment')
        self.assertEqual(beta.area.tolist(), ['Alpha', 'Beta'])
        flags = dict(zip(beta.area, beta.enough_sales))
        self.assertEqual(flags, {'Alpha': True, 'Beta': False})

    def test_resolves_common_names_and_reports_problems(self):
        self.assertEqual(resolve_area('alpha park', self.market), 'Alpha')
        self.assertEqual(resolve_area('  ALPHA ', self.market), 'Alpha')
        with self.assertRaisesRegex(ValueError, 'several DLD areas'):
            resolve_area('Shared Name', self.market)
        with self.assertRaisesRegex(ValueError, 'Did you mean'):
            resolve_area('Alpa', self.market)

    def test_order_follows_the_request(self):
        result = compare_areas(['Epsilon', 'Alpha'], self.market, property_kind='Apartment')
        self.assertEqual(result.area.tolist(), ['Epsilon', 'Alpha'])


@unittest.skipUnless((ROOT / 'data/shared/forecast_manifest.json').exists(), 'shared files not present')
class TestSharedFiles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.market = load_market()

    def test_two_budgets_give_visibly_different_shortlists(self):
        result = contrast_budgets(self.market)
        low, high = (result['shortlists'][b] for b in (result['chosen']['low_budget'], result['chosen']['high_budget']))
        self.assertEqual((len(low), len(high)), (5, 5))
        self.assertEqual(result['chosen']['overlap'], 0)
        self.assertGreaterEqual(high.price_median_aed.median() / low.price_median_aed.median(), 4)
        self.assertTrue(set(low.area).isdisjoint(set(high.area)) or set(low.property_kind) != set(high.property_kind))

    def test_every_row_has_sources_and_enough_sales(self):
        rows = shortlist(2_000_000, self.market, top_n=20)
        self.assertTrue((rows.sales_count >= 50).all())
        self.assertTrue(rows[['window_start', 'window_end', 'data_cutoff_date', 'price_median_aed']].notna().all().all())
        self.assertTrue(rows.price_median_aed.between(1_000_000, 2_000_000).all())

    def test_known_name_resolves(self):
        self.assertEqual(resolve_area('Dubai Marina', self.market), 'Marsa Dubai')


if __name__ == '__main__':
    unittest.main()
