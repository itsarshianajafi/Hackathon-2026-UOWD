# Off-plan handover check

Is an off-plan project being delivered on schedule? Built only from Dubai Land Department data: the project
register (schedule, percent complete, homes, developer) and the building register (English project names).

## Commands

```bash
# Build once from the DLD exports (kept out of Git, like the sales exports)
python -m src.dld_data.projects --projects data/raw/projects_0001.xlsx --buildings data/raw/buildings_0001.csv

python -m src.advisor.handover --project "Samana"                    # every matching active project
python -m src.advisor.handover --area "Jumeirah Village Circle"      # DLD name or the name people use
python -m src.advisor.handover --developer 2420                      # DLD developer number
python -m unittest tests.test_handover
```

## Functions (`src/advisor/handover.py`)

| Function | Returns |
|---|---|
| `project_check(name or number)` | Matching active projects: status, numbers and a one-sentence verdict |
| `area_handover(area)` | Active projects, homes by status, late share vs all of Dubai, longest overdue |
| `developer_check(number)` | Finished, cancelled and active projects; late share of active homes |

Example verdicts:

- *SLS RESIDENCES AT PALM JUMEIRAH: planned to finish 2026-07-31, now 3 months past that and 60% complete.*
- *Greenfield by Samana Developers: 1% complete with 33% of its planned build time gone; similar projects are
  at 5% (median of 205), so it is behind its peers.*

## Files (`data/shared/`)

| File | What |
|---|---|
| `project_progress.csv` | One row per active project: schedule, percent complete, peers, status, months overdue |
| `developer_handover.csv` | One row per developer: finished, cancelled, active, overdue, late share |
| `project_progress_report.json` | Snapshot date, counts by status, rules, input file hashes |

## Method

For each ACTIVE project in the register (snapshot 2026-11-01), the share of its planned build time that has
passed is compared with DLD's percent complete. A straight line is the wrong yardstick: Dubai projects report
progress late (halfway through their planned time the typical one is about 6-16% complete; at the planned end,
about 40-60%), so it would call almost every project late. Each project is compared with **peers** instead:
the other active projects within 0.1 of the same time share (at least 20 of them).

| Status | Rule |
|---|---|
| `overdue` | Planned end date has passed and the project is not finished (a fact in the register) |
| `behind_peers` | Less progress than 75% of peers at the same stage |
| `ahead_of_peers` | More progress than 75% of peers at the same stage |
| `typical` | In between |
| `early` | Less than a quarter of the planned time has passed: too early to judge |
| `unknown` | No planned start or end date, or fewer than 20 peers; nothing is guessed |

No finish date is projected: progress speeds up late, so extending today's pace would overstate delays.

## Results (snapshot 2026-11-01)

1,237 active projects: 246 overdue (62,385 homes), 187 behind peers, 408 typical, 189 ahead, 43 early,
164 unknown. Across Dubai, 37.6% of homes in judged projects are overdue or behind peers; in Jumeirah Village
Circle (Al Barsha South Fourth) it is 56.2%. English names cover 99.3% of active projects.

## Checks against the raw register

Recomputed with separate code from the raw project file: the overdue count (246), one project's peer count,
median and percentile (Greenfield: 205 peers, median 5%, 11th percentile), and Jumeirah Village Circle's late
share (56.2%) and homes (29,550). All match exactly.

## Limits

- DLD does not publish when percent complete was last updated, so a stale figure can look slow.
- Finished projects nearly always record completion on their planned end date, so past delays cannot be
  measured; only projects still being built are judged.
- Developer names are in Arabic only in the register; English names need DLD's developer list.
- Short names such as "JVC" are not recognised here; use the DLD name or the full common name.
