"""Handover check: schedule status against peers, and the project, area and developer answers."""
import json
import os
import subprocess
import sys
import unittest

import numpy as np
import pandas as pd

from src.advisor import handover as H
from src.advisor.handover import (ROOT, Handover, area_handover, developer_check, late_share, project_check,
                                  resolve_area, verdict)
from src.dld_data import projects as P

AS_OF = '2026-11-01'


def project(number, share, pct, area='Alpha', homes=100, developer=1, status='ACTIVE', planned_months=40,
            start=True, cancelled=None):
    """A project `share` of the way through a planned build of `planned_months`, `pct` percent complete."""
    begin = pd.Timestamp(AS_OF) - pd.DateOffset(days=int(share * planned_months * 30.4375))
    end = begin + pd.DateOffset(days=int(planned_months * 30.4375))
    return {'project_id': 1000 + number, 'project_number': number, 'project_name': f'مشروع {number}',
            'project_status': status, 'area_name_en': area, 'master_project_en': 'Master',
            'developer_number': developer, 'developer_name': f'مطور {developer}', 'percent_completed': pct,
            'project_start_date': begin if start else None, 'project_end_date': end, 'completion_date': None,
            'cancellation_date': cancelled, 'no_of_units': homes, 'no_of_villas': 0, 'load_timestamp': AS_OF}


def register():
    rows = [project(n, 0.5, 10 + n % 20, area='Peers', developer=9) for n in range(100, 140)]   # 40 peers, 10..29%
    rows += [project(1, 0.5, 2), project(2, 0.5, 60), project(3, 0.5, 19.5),                   # behind / ahead / typical
             project(4, 1.2, 70, homes=300), project(5, 0.1, 1), project(6, 0.5, 30, start=False),
             project(7, 0.5, 100, status='FINISHED'), project(8, 0.4, 5, status='PENDING', cancelled='2025-01-01')]
    return pd.DataFrame(rows)


def names():
    return pd.Series({1001: 'Slow Tower', 1002: 'Fast Tower', 1003: 'Middle Tower', 1004: 'Late Villas'})


class TestAssess(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.progress = P.assess(register(), names(), AS_OF).set_index('project_number')

    def test_only_active_projects(self):
        self.assertNotIn(7, self.progress.index)
        self.assertNotIn(8, self.progress.index)
        self.assertEqual(len(self.progress), 46)

    def test_statuses(self):
        status = self.progress.status
        self.assertEqual(status[1], 'behind_peers')
        self.assertEqual(status[2], 'ahead_of_peers')
        self.assertEqual(status[3], 'typical')
        self.assertEqual(status[4], 'overdue')
        self.assertEqual(status[5], 'early')
        self.assertEqual(status[6], 'unknown')        # no start date: nothing guessed

    def test_peer_numbers(self):
        slow = self.progress.loc[1]
        self.assertGreaterEqual(slow.peer_count, P.MIN_PEERS)
        self.assertEqual(slow.progress_percentile, 0.0)
        self.assertAlmostEqual(self.progress.loc[4].months_overdue, 8.0, delta=0.2)
        self.assertTrue(np.isnan(self.progress.loc[1].months_overdue))
        self.assertEqual(self.progress.loc[1].project_name_en, 'Slow Tower')

    def test_too_few_peers_is_unknown(self):
        lonely = P.assess(pd.DataFrame([project(1, 0.5, 5), project(2, 0.5, 50)]), names(), AS_OF)
        self.assertEqual(set(lonely.status), {'unknown'})

    def test_straight_line_is_not_the_yardstick(self):
        # 15% done at half time would be "35 points behind" a straight line, but it is typical among these peers.
        typical = P.assess(pd.concat([register(), pd.DataFrame([project(9, 0.5, 15)])]), names(), AS_OF)
        self.assertEqual(typical.set_index('project_number').status[9], 'typical')

    def test_developer_summary(self):
        progress = P.assess(register(), names(), AS_OF)
        dev = P.developer_summary(register(), progress).set_index('developer_number').loc[1]
        self.assertEqual((dev.finished_projects, dev.cancelled_projects, dev.overdue_projects), (1, 1, 1))
        self.assertEqual(dev.active_projects, 6)
        # judged homes: 1, 2, 3 (100 each) and 4 (300); late: 1 (behind) and 4 (overdue) = 400 of 600
        self.assertAlmostEqual(dev.late_homes_share, 400 / 600, places=3)


class TestAnswers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        progress = P.assess(register(), names(), AS_OF)
        cls.handover = Handover(progress, P.developer_summary(register(), progress))
        cls.names = {'Alpha': 'Alpha Heights, Alpha Park', 'Peers': 'Shared', 'Other': 'Shared'}

    def test_project_search_by_name_and_number(self):
        self.assertEqual(project_check('slow', self.handover).project_number.tolist(), [1])
        self.assertEqual(project_check('4', self.handover).status.tolist(), ['overdue'])
        with self.assertRaisesRegex(ValueError, 'No active project'):
            project_check('Nowhere Heights', self.handover)

    def test_verdicts_use_only_the_numbers(self):
        rows = project_check('tower', self.handover).set_index('project_number')
        self.assertIn('behind its peers', rows.verdict[1])
        self.assertIn('ahead of its peers', rows.verdict[2])
        late = project_check('late villas', self.handover).iloc[0]
        self.assertIn('8 months past', late.verdict)
        self.assertIn('cannot be judged', verdict(self.handover.projects.set_index('project_number').loc[6]
                                                   .rename(None).to_frame().T.assign(project_number=6).iloc[0]))

    def test_area_answer(self):
        out = area_handover('alpha park', self.handover, self.names)     # the name people use works too
        self.assertEqual(out['area'], 'Alpha')
        self.assertEqual(out['active_projects'], 6)
        self.assertAlmostEqual(out['late_homes_share'], round(400 / 600, 3))
        self.assertEqual(out['longest_overdue'][0]['project_number'], 4)
        self.assertIsNotNone(out['dubai_late_homes_share'])

    def test_developer_answer(self):
        out = developer_check(1, self.handover)
        self.assertEqual((out['active_projects'], out['overdue_projects']), (6, 1))
        with self.assertRaises(ValueError):
            developer_check(777, self.handover)

    def test_late_share_ignores_unjudged(self):
        p = self.handover.projects
        self.assertAlmostEqual(late_share(p[p.area == 'Alpha']), 400 / 600)
        self.assertTrue(np.isnan(late_share(p[p.status == 'early'])))

    def test_area_names_are_exact_never_guessed(self):
        self.assertEqual(resolve_area('  ALPHA ', self.handover, self.names), 'Alpha')
        with self.assertRaisesRegex(ValueError, 'several DLD areas'):
            resolve_area('Shared', self.handover, self.names)
        with self.assertRaisesRegex(ValueError, 'Did you mean'):
            resolve_area('Alpa', self.handover, self.names)


@unittest.skipUnless((ROOT / 'data/shared/project_progress.csv').exists(), 'project progress not built')
class TestSharedProjects(unittest.TestCase):
    def test_register_snapshot(self):
        p = pd.read_csv(ROOT / 'data/shared/project_progress.csv')
        self.assertEqual(len(p), p.project_number.nunique())
        self.assertGreater(p.project_name_en.notna().mean(), 0.95)
        judged = p[p.status.isin(['behind_peers', 'typical', 'ahead_of_peers'])]
        # peers split roughly into quarters by construction
        self.assertTrue(0.15 < (judged.status == 'behind_peers').mean() < 0.35)
        overdue = p[p.status == 'overdue']
        self.assertTrue((pd.to_datetime(overdue.planned_end) < pd.Timestamp(p.as_of.iloc[0])).all())

    def test_area_by_common_name(self):
        out = area_handover('Jumeirah Village Circle')
        self.assertEqual(out['area'], 'Al Barsha South Fourth')
        self.assertGreater(out['active_projects'], 50)


if __name__ == '__main__':
    unittest.main()
