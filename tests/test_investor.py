"""Rent cleaning, supply pipeline and the investor numbers in shortlists, on synthetic data."""
import unittest

import numpy as np
import pandas as pd

from src.advisor.data import ROOT, build_market, load_market
from src.advisor.shortlist import investment_numbers, resolve_area, shortlist
from src.dld_data.rents import clean, summarise
from src.dld_data.supply import pipeline
from tests.test_advisor import MANIFEST, MONTHS, PRICE, QUALITY, cells, forecast, trend

TODAY = pd.Timestamp('2026-11-18')


def contract(cid, area='Alpha', rent=60_000, start='2026-01-15', kind='Flat', usage='Residential',
             reg='New', props=1, line=1, size=60.0):
    return {'contract_id': cid, 'line_number': line, 'area_name_en': area, 'annual_amount': rent,
            'contract_start_date': start, 'contract_reg_type_en': reg, 'ejari_property_type_en': kind,
            'property_usage_en': usage, 'no_of_prop': props, 'actual_area': size}


class TestRentCleaning(unittest.TestCase):
    def test_rules_and_counts(self):
        raw = pd.DataFrame([
            contract('A1'), contract('A1'),                                   # exact duplicate
            contract('M1', line=1), contract('M1', line=2),                   # one contract, two homes
            contract('P1', props=3),                                          # several homes, one amount
            contract('O1', kind='Office', usage='Commercial'),                # not a home
            contract('L1', kind='Labor Camps'),                               # not a flat or villa
            contract('F1', start='2027-03-01'),                               # starts after today
            contract('Z1', rent=0), contract('N1', reg=None),                 # no rent / no contract type
            contract('S1', size=5.0),                                         # kept, no rent per m2
            contract('V1', kind='Villa', rent=200_000, size=250.0, reg='Renew'),
            contract('T1', kind='Studio', rent=40_000, size=35.0)])
        rents, stats = clean(raw, today=TODAY)
        self.assertEqual(stats, {'input_rows': 13, 'duplicate_rows': 1, 'multi_property_rows': 3,
                                 'not_residential_home_rows': 2, 'invalid_rows': 3, 'small_area_rows': 1,
                                 'output_rows': 4})
        self.assertEqual(sorted(rents.property_kind), ['Apartment', 'Apartment', 'Apartment', 'Villa'])
        self.assertEqual(set(rents.contract_type), {'New', 'Renewal'})
        self.assertTrue(np.isnan(rents.loc[rents.area_m2 == 5.0, 'rent_per_m2_aed']).all())
        self.assertEqual(rents.loc[rents.area_m2 == 60.0, 'rent_per_m2_aed'].iloc[0], 1000.0)

    def test_monthly_summary(self):
        raw = pd.DataFrame([contract(f'C{i}', rent=r, size=60.0) for i, r in enumerate([60_000, 66_000, 72_000])])
        monthly = summarise(clean(raw, today=TODAY)[0])
        self.assertEqual(len(monthly), 1)
        row = monthly.iloc[0]
        self.assertEqual((row.contract_count, row.median_annual_rent_aed, row.median_rent_per_m2_aed), (3, 66_000, 1100))


class TestSupply(unittest.TestCase):
    def test_counts_only_homes_still_being_built(self):
        projects = pd.DataFrame({
            'area_name_en': ['Alpha', 'Alpha', 'Alpha', 'Beta'],
            'project_status': ['ACTIVE', 'ACTIVE', 'FINISHED', 'ACTIVE'],
            'percent_completed': [40, 100, 100, 10],
            'no_of_units': [100, 50, 70, 0], 'no_of_villas': [0, 0, 0, 20],
            'project_end_date': ['2027-03-01', '2026-01-01', '2024-01-01', '2029-01-01']})
        out = pipeline(projects, '2026-10-27').set_index('area')
        self.assertEqual(out.loc['Alpha', 'pipeline_homes'], 100)
        self.assertEqual(out.loc['Alpha', 'pipeline_homes_next_12m'], 100)
        self.assertEqual((out.loc['Beta', 'pipeline_homes'], out.loc['Beta', 'pipeline_homes_next_12m']), (20, 0))


def rent_rows(area, kind, per_m2, count, contract_type='New', months=MONTHS):
    each = count // len(months)
    return [{'area': area, 'property_kind': kind, 'contract_type': contract_type, 'month': m,
             'contract_count': each, 'median_annual_rent_aed': per_m2 * 80, 'median_area_m2': 80.0,
             'median_rent_per_m2_aed': per_m2} for m in months]


def investor_market():
    sales = (cells('Alpha', 'Ready', 'Unit', 'Flat', 800_000, 120, per_m2=10_000)
             + cells('Gamma', 'Ready', 'Unit', 'Flat', 900_000, 120, per_m2=10_000)
             + cells('Gamma', 'Off-Plan', 'Unit', 'Flat', 950_000, 120, per_m2=12_000)
             + cells('Thin', 'Ready', 'Unit', 'Flat', 850_000, 120, per_m2=10_000))
    rents = pd.DataFrame(rent_rows('Alpha', 'Apartment', 500, 120)            # 5% gross
                         + rent_rows('Alpha', 'Apartment', 900, 120, 'Renewal')  # renewals are ignored
                         + rent_rows('Gamma', 'Apartment', 900, 240)            # 9% ready, 7.5% off-plan
                         + rent_rows('Thin', 'Apartment', 900, 24)              # too few contracts
                         + rent_rows('Alpha', 'Apartment', 5000, 1200, months=['2025-09']))   # outside window
    trends = pd.DataFrame([trend(a, 'Ready', 0.0) for a in ('Alpha', 'Gamma', 'Thin')])
    forecasts = pd.DataFrame([forecast('Alpha', 'Ready', PRICE, 'fallback', 10_000, 10_000)])
    supply = pd.DataFrame({'area': ['Gamma'], 'pipeline_homes': [500], 'pipeline_homes_next_12m': [120]})
    names = pd.DataFrame({'area': ['Gamma'], 'common_name': ['Gamma Gardens']})
    market = build_market(pd.DataFrame(sales), trends, forecasts, names, MANIFEST, QUALITY,
                          rent_monthly=rents, supply=supply)
    market.aliases = pd.DataFrame({'alias': ['GG'], 'area': ['Gamma']})
    return market


class TestInvestorNumbers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.market = investor_market()
        cls.seg = cls.market.segments.set_index(['area', 'registration_type'])

    def test_yield_uses_new_contracts_in_the_window(self):
        alpha = self.seg.loc[('Alpha', 'Ready')]
        self.assertAlmostEqual(alpha.gross_yield, 0.05)
        self.assertEqual((alpha.rent_contracts, alpha.rent_renewals), (120, 120))
        self.assertAlmostEqual(alpha.est_annual_rent_aed, 40_000)
        self.assertAlmostEqual(alpha.years_to_repay, 20)

    def test_rent_applies_to_both_registration_types(self):
        self.assertAlmostEqual(self.seg.loc[('Gamma', 'Ready')].gross_yield, 0.09)
        self.assertAlmostEqual(self.seg.loc[('Gamma', 'Off-Plan')].gross_yield, 0.075)

    def test_thin_rent_gives_no_yield(self):
        thin = self.seg.loc[('Thin', 'Ready')]
        self.assertEqual(thin.rent_contracts, 24)
        self.assertTrue(np.isnan(thin.gross_yield) and np.isnan(thin.years_to_repay))

    def test_supply_joined_and_missing_area_is_zero(self):
        self.assertEqual(self.seg.loc[('Gamma', 'Ready')].pipeline_homes, 500)
        self.assertEqual(self.seg.loc[('Alpha', 'Ready')].pipeline_homes, 0)

    def test_invest_goal_rewards_yield(self):
        live = shortlist(1_000_000, self.market, registration_type='Ready')
        invest = shortlist(1_000_000, self.market, registration_type='Ready', goal='invest')
        self.assertIn('rental_yield', invest.score_components[0])
        self.assertNotIn('rental_yield', live.score_components[0])
        self.assertEqual(invest.area.iloc[0], 'Gamma')                     # 9% beats 5%
        by_yield = shortlist(1_000_000, self.market, sort_by='yield')
        self.assertEqual(by_yield.gross_yield.dropna().tolist(), sorted(by_yield.gross_yield.dropna(), reverse=True))
        self.assertTrue(np.isnan(by_yield.gross_yield.iloc[-1]))           # no yield goes last
        with self.assertRaises(ValueError):
            shortlist(1_000_000, self.market, goal='flip')

    def test_caveats_explain_investor_limits(self):
        rows = shortlist(1_000_000, self.market).set_index(['area', 'registration_type'])
        self.assertIn('yield is gross', rows.loc[('Alpha', 'Ready'), 'caveats'])
        self.assertIn('no rental yield', rows.loc[('Thin', 'Ready'), 'caveats'])
        self.assertIn('no rent until handover', rows.loc[('Gamma', 'Off-Plan'), 'caveats'])

    def test_investment_numbers_for_a_price(self):
        out = investment_numbers('Alpha', 'Ready', 'Apartment', 800_000, self.market)
        self.assertEqual((out['size_m2'], out['annual_rent_aed'], out['gross_yield']), (80.0, 40_000, 0.05))
        self.assertEqual((out['monthly_rent_aed'], out['years_to_repay'], out['net_yield']), (3_333, 20.0, None))
        net = investment_numbers('Alpha', 'Ready', 'Apartment', 800_000, self.market, running_costs_share=0.25)
        self.assertEqual((net['net_annual_rent_aed'], net['net_yield'], net['years_to_repay']), (30_000, 0.0375, 26.7))
        sized = investment_numbers('GG', 'Ready', 'Apartment', 1_000_000, self.market, size_m2=100)
        self.assertEqual(sized['area'], 'Gamma')
        self.assertEqual((sized['annual_rent_aed'], sized['gross_yield'], sized['size_assumed']), (90_000, 0.09, False))
        self.assertNotIn('rent rests on only', ' '.join(sized['caveats']))      # 240 contracts is enough
        self.assertEqual(sized['pipeline_homes'], 500)

    def test_investment_numbers_refuses_what_it_cannot_back(self):
        with self.assertRaisesRegex(ValueError, 'Too few new rent contracts'):
            investment_numbers('Thin', 'Ready', 'Apartment', 850_000, self.market)
        with self.assertRaisesRegex(ValueError, 'No Villa'):
            investment_numbers('Alpha', 'Ready', 'Villa', 850_000, self.market)
        for kwargs in ({'size_m2': 3}, {'running_costs_share': 1.5}):
            with self.assertRaises(ValueError):
                investment_numbers('Alpha', 'Ready', 'Apartment', 800_000, self.market, **kwargs)
        with self.assertRaises(ValueError):
            investment_numbers('Alpha', 'Ready', 'Apartment', 0, self.market)


@unittest.skipUnless((ROOT / 'data/shared/rent_monthly.csv').exists(), 'rent summary not built')
class TestSharedRents(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.market = load_market()

    def test_yields_are_plausible_and_sourced(self):
        seg = self.market.segments
        ready = seg[(seg.registration_type == 'Ready') & (seg.sales_count >= 50)].gross_yield.dropna()
        self.assertGreater(len(ready), 40)
        self.assertTrue(ready.between(0.02, 0.15).all())
        self.assertTrue(0.05 <= ready.median() <= 0.09)

    def test_aliases_resolve(self):
        self.assertEqual(resolve_area('JVC', self.market), 'Al Barsha South Fourth')
        self.assertEqual(resolve_area('jlt', self.market), 'Al Thanyah Fifth')


if __name__ == '__main__':
    unittest.main()
