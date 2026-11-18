"""Off-plan handover check: is each project under construction on schedule?

    python -m src.dld_data.projects --projects data/raw/projects_0001.xlsx --buildings data/raw/buildings_0001.csv

Reads DLD's project register (and its building register, only for English project names) and writes
data/shared/project_progress.csv (one row per active project) and data/shared/developer_handover.csv
(one row per developer), plus project_progress_report.json with every count and input hash.

For each ACTIVE project it takes the share of the planned build time that has passed by the register's
own snapshot date, and compares DLD's percent_completed with peers: the other active projects at the
same stage (within 0.1 of the same time share). Dubai projects report most of their progress late
(halfway through the planned time the typical one is under 20% complete), so a straight-line
"expected progress" would call almost every project late. Peers are the fair yardstick.

- overdue         the planned end date has passed and the project is not finished (a fact)
- behind_peers    less progress than 75% of peers at the same stage
- ahead_of_peers  more progress than 75% of peers at the same stage
- typical         in between
- early           less than a quarter of the planned time has passed: too early to judge
- unknown         no planned start or end date, or too few peers; nothing is guessed

No finish date is projected: progress speeds up late, so extending today's pace would overstate delays.
DLD does not publish when each percent_completed was last updated.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

SHARED = Path('data/shared')
EARLY_SHARE = 0.25          # before a quarter of the planned time has passed, judging is premature
PEER_BAND = 0.10            # peers: projects whose planned-time share is within this of the project's
MIN_PEERS = 20              # fewer peers than this and no comparison is made
BEHIND, AHEAD = 0.25, 0.75  # progress percentile among peers below / above which a project stands out
JUDGED = ('overdue', 'behind_peers', 'typical', 'ahead_of_peers')     # statuses that say something
LATE = ('overdue', 'behind_peers')
PROJECT_COLUMNS = ['project_id', 'project_number', 'project_name', 'project_status', 'area_name_en',
                   'master_project_en', 'developer_number', 'developer_name', 'percent_completed',
                   'project_start_date', 'project_end_date', 'completion_date', 'cancellation_date',
                   'no_of_units', 'no_of_villas', 'load_timestamp']


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def read_projects(path):
    path = Path(path)
    reader = pd.read_excel if path.suffix.lower() in ('.xlsx', '.xls') else pd.read_csv
    return reader(path, usecols=PROJECT_COLUMNS)


def english_names(buildings_path):
    """project_id -> English project name, from DLD's building register. Conflicting ids are dropped."""
    b = pd.read_csv(buildings_path, usecols=['project_id', 'project_name_en']).dropna().drop_duplicates()
    b['project_name_en'] = b.project_name_en.astype(str).str.strip()
    b = b.drop_duplicates()
    clash = b.project_id.duplicated(keep=False)
    return b.loc[~clash].set_index('project_id').project_name_en, int(b.loc[clash].project_id.nunique())


def months_between(start, end):
    return (end - start).dt.days / 30.4375


def _peer_stats(share, pct):
    """For each project: how many peers, their median progress, and its progress percentile among them.

    Peers are the other projects with a known schedule whose time share is within PEER_BAND. Ties count
    half, so a project equal to every peer sits at the 50th percentile.
    """
    s, p = share.to_numpy(dtype=float), pct.to_numpy(dtype=float)
    valid = np.isfinite(s) & np.isfinite(p)
    count = np.zeros(len(s), dtype=int)
    median = np.full(len(s), np.nan)
    percentile = np.full(len(s), np.nan)
    for i in np.flatnonzero(valid):
        mask = valid & (np.abs(s - s[i]) <= PEER_BAND)
        mask[i] = False
        others = p[mask]
        count[i] = len(others)
        if len(others):
            median[i] = np.median(others)
            percentile[i] = ((others < p[i]).sum() + 0.5 * (others == p[i]).sum()) / len(others)
    return pd.DataFrame({'peer_count': count, 'peer_median': median, 'percentile': percentile}, index=share.index)


def assess(projects, names, as_of):
    """One row per active project with its schedule status. Pure function for tests."""
    as_of = pd.Timestamp(as_of)
    df = projects.loc[projects.project_status.astype('string').str.upper().eq('ACTIVE')].copy()
    for col in ['project_start_date', 'project_end_date']:
        df[col] = pd.to_datetime(df[col], errors='coerce')
    pct = pd.to_numeric(df.percent_completed, errors='coerce').clip(0, 100)
    start, end = df.project_start_date, df.project_end_date
    planned = months_between(start, end)
    elapsed = months_between(start, pd.Series(as_of, index=df.index))
    share = (elapsed / planned).where(planned > 0)
    known = start.notna() & end.notna() & planned.gt(0) & pct.notna()
    peers = _peer_stats(share.where(known), pct.where(known))
    status = np.select(
        [~known, end.lt(as_of), share.lt(EARLY_SHARE), peers.peer_count.lt(MIN_PEERS),
         peers.percentile.lt(BEHIND), peers.percentile.gt(AHEAD)],
        ['unknown', 'overdue', 'early', 'unknown', 'behind_peers', 'ahead_of_peers'], default='typical')
    homes =(pd.to_numeric(df.no_of_units, errors='coerce').fillna(0)
             + pd.to_numeric(df.no_of_villas, errors='coerce').fillna(0)).astype(int)
    out = pd.DataFrame({
        'project_number': df.project_number, 'project_id': df.project_id,
        'project_name_en': df.project_id.map(names), 'project_name_ar': df.project_name,
        'area': df.area_name_en, 'master_project_en': df.master_project_en,
        'developer_number': df.developer_number, 'developer_name_ar': df.developer_name,
        'homes': homes, 'percent_completed': pct.round(2),
        'planned_start': start.dt.strftime('%Y-%m-%d'), 'planned_end': end.dt.strftime('%Y-%m-%d'),
        'planned_months': planned.round(1), 'time_elapsed_share': share.round(3),
        'peer_count': peers.peer_count, 'peer_median_progress': peers.peer_median.round(1),
        'progress_percentile': peers.percentile.round(3), 'status': status,
        'months_overdue': months_between(end, pd.Series(as_of, index=df.index)).where(status == 'overdue').round(1),
        'as_of': as_of.strftime('%Y-%m-%d')})
    return out.sort_values(['area', 'project_number']).reset_index(drop=True)


def developer_summary(projects, progress):
    """Per developer: what DLD records as finished, cancelled and active, and how the active ones stand."""
    reg = projects.assign(status=projects.project_status.astype('string').str.upper())
    counts = reg.groupby('developer_number').agg(
        developer_name_ar=('developer_name', 'first'),
        finished_projects=('status', lambda s: int(s.eq('FINISHED').sum())),
        cancelled_projects=('cancellation_date', lambda s: int(s.notna().sum())))
    judged = progress.loc[progress.status.isin(JUDGED)]
    active = progress.groupby('developer_number').agg(
        active_projects=('status', 'size'), active_homes=('homes', 'sum'))
    late = judged.assign(late=judged.status.isin(LATE) * judged.homes).groupby('developer_number').agg(
        judged_homes=('homes', 'sum'), late_homes=('late', 'sum'), overdue_projects=('status', lambda s: int(s.eq('overdue').sum())))
    out = counts.join(active, how='left').join(late, how='left').fillna(
        {'active_projects': 0, 'active_homes': 0, 'judged_homes': 0, 'late_homes': 0, 'overdue_projects': 0})
    for col in ['active_projects', 'active_homes', 'judged_homes', 'late_homes', 'overdue_projects']:
        out[col] = out[col].astype(int)
    out['late_homes_share'] = (out.late_homes / out.judged_homes).where(out.judged_homes > 0).round(3)
    return out.reset_index().sort_values('active_homes', ascending=False)


def prepare(projects_path, buildings_path, output_dir=SHARED):
    projects = read_projects(projects_path)
    as_of = pd.to_datetime(projects.load_timestamp, errors='coerce').max().normalize()
    names, clashes = english_names(buildings_path)
    progress = assess(projects, names, as_of)
    developers = developer_summary(projects, progress)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    progress.to_csv(output_dir / 'project_progress.csv', index=False)
    developers.to_csv(output_dir / 'developer_handover.csv', index=False)
    report = {'as_of': as_of.strftime('%Y-%m-%d'), 'register_projects': len(projects), 'active_projects': len(progress),
              'status_projects': progress.status.value_counts().to_dict(),
              'status_homes': progress.groupby('status').homes.sum().astype(int).to_dict(),
              'english_name_share': round(float(progress.project_name_en.notna().mean()), 4),
              'building_ids_with_conflicting_names': clashes,
              'rules': {'early_share': EARLY_SHARE, 'peer_band': PEER_BAND, 'min_peers': MIN_PEERS,
                        'behind_percentile': BEHIND, 'ahead_percentile': AHEAD},
              'inputs': [{'file': Path(p).name, 'sha256': sha256(p)} for p in (projects_path, buildings_path)],
              'note': 'percent_completed is as DLD reports it; DLD does not publish when it was last updated.',
              'prepared_at_utc': pd.Timestamp.now(tz='UTC').isoformat()}
    (output_dir / 'project_progress_report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--projects', type=Path, required=True, help='DLD project register export (.xlsx or .csv)')
    parser.add_argument('--buildings', type=Path, required=True, help='DLD building register export, for English names')
    parser.add_argument('--output-dir', type=Path, default=SHARED)
    args = parser.parse_args()
    try:
        report = prepare(args.projects, args.buildings, args.output_dir)
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, f'Project preparation failed: {exc}\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'inputs'}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
