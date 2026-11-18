"""Off-plan handover check: is a project, an area or a developer delivering on schedule?

    python -m src.advisor.handover --project "Samana Sky Views"
    python -m src.advisor.handover --area JVC              # or "Jumeirah Village Circle" or the DLD name
    python -m src.advisor.handover --developer 2420

For the backend and agent: area_handover, developer_check and project_summary return JSON-safe dicts;
HANDOVER_TOOL is an OpenAI tool definition and get_handover(**arguments) answers it.

Reads data/shared/project_progress.csv and developer_handover.csv, built from DLD's project register by
src.dld_data.projects. A project is compared with peers: the other active Dubai projects at the same
stage of their planned build time. Overdue means the planned end date has passed (a fact in the register).
Areas can be named by their DLD name or the name people use, from the team's area_names.csv.
"""
import argparse
from dataclasses import dataclass
import difflib
import json
from pathlib import Path
import re
import sys

import pandas as pd

from src.dld_data.projects import JUDGED, LATE

ROOT = Path(__file__).resolve().parents[2]
SHARED = Path('data/shared')
CAVEATS = ['percent complete is as DLD reports it; DLD does not publish when it was last updated',
           'peers are active Dubai projects at the same stage of their planned build time']


@dataclass
class Handover:
    projects: pd.DataFrame
    developers: pd.DataFrame

    @property
    def as_of(self):
        return self.projects.as_of.iloc[0] if len(self.projects) else None


def load_handover(root=ROOT):
    shared = Path(root) / SHARED
    path = shared / 'project_progress.csv'
    if not path.exists():
        raise ValueError('project_progress.csv is missing. Run python -m src.dld_data.projects first.')
    return Handover(pd.read_csv(path), pd.read_csv(shared / 'developer_handover.csv'))


def late_share(frame):
    """Share of homes in judged projects that are overdue or behind their peers. NaN if none judged."""
    judged = frame.loc[frame.status.isin(JUDGED)]
    homes = judged.homes.sum()
    return float(judged.loc[judged.status.isin(LATE)].homes.sum() / homes) if homes else float('nan')


def verdict(row):
    """One plain sentence a buyer can read, built only from the row's own numbers."""
    name = row.project_name_en if isinstance(row.project_name_en, str) else f'Project {row.project_number}'
    done = f'{row.percent_completed:.0f}% complete'
    if row.status == 'unknown':
        return f'{name}: {done}; DLD lists no full schedule, so it cannot be judged.'
    gone = f'{min(row.time_elapsed_share, 9.99):.0%} of its planned build time gone'
    if row.status == 'overdue':
        return (f'{name}: planned to finish {row.planned_end}, now {row.months_overdue:.0f} months past that '
                f'and {done}.')
    if row.status == 'early':
        return f'{name}: {done} with {gone}; too early to judge.'
    peers = (f'similar projects are at {row.peer_median_progress:.0f}% (median of {int(row.peer_count)})')
    word = {'behind_peers': 'behind', 'ahead_of_peers': 'ahead of', 'typical': 'in line with'}[row.status]
    return f'{name}: {done} with {gone}; {peers}, so it is {word} its peers.'


def _rows(frame):
    """The rows with a verdict sentence each. An empty frame stays empty (no overdue projects is normal)."""
    out = frame.copy()
    out['verdict'] = [verdict(row) for row in out.itertuples(index=False)]
    return out


def _records(frame, columns):
    """JSON-safe list of dicts: empty cells become null and numbers plain Python, so FastAPI can send them."""
    return json.loads(frame[columns].to_json(orient='records', force_ascii=False))


PROJECT_FIELDS = ['project_number', 'project_name_en', 'area', 'developer_number', 'homes', 'percent_completed',
                  'planned_start', 'planned_end', 'time_elapsed_share', 'peer_count', 'peer_median_progress',
                  'progress_percentile', 'status', 'months_overdue', 'verdict']


def project_check(query, handover=None):
    """Projects matching a DLD project number or part of the English (or Arabic) name, as a table."""
    handover = handover or load_handover()
    p = handover.projects
    text = ' '.join(str(query).split())
    if len(text) < 2 and not text.isdigit():
        raise ValueError('Give a project name (at least 2 characters) or a DLD project number.')
    if text.isdigit():
        found = p.loc[p.project_number == int(text)]
    else:
        key = text.casefold()
        found = p.loc[p.project_name_en.fillna('').str.casefold().str.contains(key, regex=False)
                      | p.project_name_ar.fillna('').str.contains(text, regex=False)]
    if found.empty:
        raise ValueError(f'No active project matches "{query}". Finished projects are not checked.')
    return _rows(found.sort_values(['project_name_en', 'project_number'], na_position='last'))


def project_summary(query, handover=None, limit=20):
    """project_check as a JSON-safe answer for the API or the agent."""
    handover = handover or load_handover()
    rows = project_check(query, handover)
    return {'query': str(query), 'as_of': handover.as_of, 'matches': len(rows),
            'projects': _records(rows.head(limit), PROJECT_FIELDS), 'caveats': CAVEATS}


def load_aliases(root=ROOT):
    """{short name people search with: DLD area}, from data/area_search_aliases.csv (exact match only)."""
    path = Path(root) / 'data/area_search_aliases.csv'
    if not path.exists():
        return {}
    aliases = pd.read_csv(path)
    return {str(a).strip().casefold(): area for a, area in zip(aliases.alias, aliases.area)}


def resolve_area(area, handover, names=None, aliases=None):
    """DLD area name, the name people use ({DLD area: common name}), or a listed short name (JVC). Exact match."""
    if names is None:
        from src.market_data import load_area_names
        names = load_area_names()
    aliases = load_aliases() if aliases is None else aliases
    key = ' '.join(str(area).split()).casefold()
    areas = set(handover.projects.area.dropna())
    found = {a for a in areas | set(names) if a.casefold() == key}
    found |= {a for a, common in names.items()
              if key in {part.strip().casefold() for part in re.split(r'[,/]', str(common))}}
    if not found and key in aliases:
        found = {aliases[key]}
    if len(found) == 1:
        return found.pop()
    if len(found) > 1:
        raise ValueError(f'"{area}" matches several DLD areas: {sorted(found)}. Use the DLD name.')
    close = difflib.get_close_matches(str(area), sorted(areas) + [str(c) for c in names.values()], n=3, cutoff=0.6)
    hint = f' Did you mean: {", ".join(close)}?' if close else ''
    raise ValueError(f'No area called "{area}".{hint}')


def area_handover(area, handover=None, names=None, aliases=None):
    """How the homes being built in one area stand, against the whole of Dubai. JSON-safe."""
    handover = handover or load_handover()
    name = resolve_area(area, handover, names, aliases)
    p = handover.projects.loc[handover.projects.area == name]
    by_status = {k: int(v) for k, v in p.groupby('status').homes.sum().items()}
    worst = _rows(p.loc[p.status == 'overdue'].sort_values('months_overdue', ascending=False).head(5))
    return {'area': name, 'as_of': handover.as_of, 'active_projects': int(len(p)),
            'homes_being_built': int(p.homes.sum()), 'homes_by_status': by_status,
            'late_homes_share': _round(late_share(p)), 'dubai_late_homes_share': _round(late_share(handover.projects)),
            'longest_overdue': _records(worst, ['project_number', 'project_name_en', 'percent_completed', 'planned_end',
                                                'months_overdue', 'homes', 'verdict']),
            'caveats': CAVEATS + ([] if len(p) else [f'DLD lists no active projects in {name}'])}


def developer_check(developer, handover=None):
    """A developer's record in the register and how its active projects stand. By DLD developer number."""
    handover = handover or load_handover()
    d = handover.developers
    text = str(developer).strip()
    if text.endswith('.0') and text[:-2].isdigit():      # a number that went through a float
        text = text[:-2]
    if len(text) < 2 and not text.isdigit():
        raise ValueError('Give a DLD developer number (or part of the Arabic name).')
    match = d.loc[d.developer_number == int(text)] if text.isdigit() else \
        d.loc[d.developer_name_ar.fillna('').str.contains(text, regex=False)]
    if match.empty:
        raise ValueError(f'No developer matches "{developer}". Use the DLD developer number.')
    if len(match) > 1:
        raise ValueError(f'"{developer}" matches {len(match)} developers: {match.developer_number.tolist()[:10]}.')
    row = match.iloc[0]
    projects = _rows(handover.projects.loc[handover.projects.developer_number == row.developer_number])
    return {'developer_number': int(row.developer_number), 'developer_name_ar': row.developer_name_ar,
            'as_of': handover.as_of, 'finished_projects': int(row.finished_projects),
            'cancelled_projects': int(row.cancelled_projects), 'active_projects': int(row.active_projects),
            'active_homes': int(row.active_homes), 'overdue_projects': int(row.overdue_projects),
            'late_homes_share': None if pd.isna(row.late_homes_share) else float(row.late_homes_share),
            'dubai_late_homes_share': _round(late_share(handover.projects)),
            'projects': _records(projects, ['project_number', 'project_name_en', 'area', 'percent_completed',
                                            'planned_end', 'status', 'verdict']),
            'caveats': CAVEATS + ['developer names are in Arabic in the register; English names need DLD\'s developer list']}


def _round(value, digits=3):
    return None if value != value else round(float(value), digits)


def get_handover(project=None, area=None, developer=None):
    """Entry point for the agent's tool call. Exactly one argument; problems come back as {'error': ...}."""
    given = [k for k, v in (('project', project), ('area', area), ('developer', developer)) if v not in (None, '')]
    if len(given) != 1:
        return {'error': 'Give exactly one of project, area or developer.'}
    try:
        if project:
            return project_summary(project)
        return area_handover(area) if area else developer_check(developer)
    except ValueError as exc:
        return {'error': str(exc)}


HANDOVER_TOOL = {
    'type': 'function',
    'function': {
        'name': 'get_handover',
        'description': ('Is an off-plan project being delivered on schedule? Uses the Dubai Land Department project '
                        'register. Give exactly one of: a project name or DLD project number; an area (DLD name, '
                        'common name or short name like JVC); or a DLD developer number. Overdue means the planned '
                        'end date has passed; behind or ahead compares progress with similar projects at the same '
                        'stage. Quote the verdict sentences and the snapshot date.'),
        'parameters': {
            'type': 'object',
            'properties': {
                'project': {'type': 'string', 'description': 'Project name (part is enough) or DLD project number'},
                'area': {'type': 'string', 'description': 'Area, e.g. Dubai Marina, Business Bay or JVC'},
                'developer': {'type': 'string', 'description': 'DLD developer number'},
            },
            'required': [],
        },
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--project')
    group.add_argument('--area')
    group.add_argument('--developer')
    args = parser.parse_args()
    # Developer and some project names are Arabic; a default Windows console cannot print them.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='replace')
    try:
        if args.project:
            rows = project_check(args.project)
            for r in rows.itertuples():
                print(f'[{r.status}] {r.verdict}  (DLD project {r.project_number}, {r.area}, {r.homes} homes)')
            print(f'\nRegister snapshot {rows.as_of.iloc[0]}. ' + ' '.join(c[0].upper() + c[1:] + '.' for c in CAVEATS))
        else:
            out = area_handover(args.area) if args.area else developer_check(args.developer)
            print(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    except ValueError as exc:
        parser.exit(1, f'{exc}\n')


if __name__ == '__main__':
    main()
