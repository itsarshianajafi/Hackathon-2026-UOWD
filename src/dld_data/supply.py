"""Upcoming supply per area from DLD's project register: homes still being built.

    python -m src.dld_data.supply --input data/raw/projects_0001.xlsx --as-of 2026-10-27

Writes data/shared/supply_pipeline.csv. A project counts when DLD lists it as ACTIVE and it is less
than 100% complete; its homes are its units plus villas. This is context for investors (more new
homes nearby can hold rents back); it is not used to rank areas.
"""
import argparse
import json
from pathlib import Path

import pandas as pd

from .rents import sha256

SHARED = Path('data/shared')
COLUMNS = ['area_name_en', 'project_status', 'percent_completed', 'no_of_units', 'no_of_villas', 'project_end_date']


def read(path):
    path = Path(path)
    if path.suffix.lower() in ('.xlsx', '.xls'):
        return pd.read_excel(path, usecols=COLUMNS)
    return pd.read_csv(path, usecols=COLUMNS)


def pipeline(projects, as_of):
    as_of = pd.Timestamp(as_of)
    df = projects.copy()
    done = pd.to_numeric(df.percent_completed, errors='coerce')
    building = df.project_status.astype('string').str.upper().eq('ACTIVE') & done.lt(100)
    df = df.loc[building].assign(
        homes=pd.to_numeric(df.no_of_units, errors='coerce').fillna(0)
        + pd.to_numeric(df.no_of_villas, errors='coerce').fillna(0),
        end=pd.to_datetime(df.project_end_date, errors='coerce'))
    df['due_12m'] = df.homes.where(df.end.between(as_of, as_of + pd.DateOffset(months=12)), 0)
    out = df.groupby('area_name_en').agg(active_projects=('homes', 'size'), pipeline_homes=('homes', 'sum'),
                                         pipeline_homes_next_12m=('due_12m', 'sum')).reset_index()
    out = out.rename(columns={'area_name_en': 'area'})
    out[['pipeline_homes', 'pipeline_homes_next_12m']] = out[['pipeline_homes', 'pipeline_homes_next_12m']].astype(int)
    out['as_of'] = as_of.strftime('%Y-%m-%d')
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--as-of', required=True, help='date the "next 12 months" counts from, e.g. the sales cutoff')
    parser.add_argument('--output-dir', type=Path, default=SHARED)
    args = parser.parse_args()
    out = pipeline(read(args.input), args.as_of)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.output_dir / 'supply_pipeline.csv', index=False)
    report = {'file': args.input.name, 'sha256': sha256(args.input), 'areas': len(out),
              'pipeline_homes': int(out.pipeline_homes.sum()), 'as_of': args.as_of,
              'prepared_at_utc': pd.Timestamp.now(tz='UTC').isoformat()}
    (args.output_dir / 'supply_report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
