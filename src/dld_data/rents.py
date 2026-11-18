"""Clean DLD Ejari rent contract exports into a small monthly rent summary for investors.

    python -m src.dld_data.rents --input data/raw/rent_contracts_0001.csv data/raw/rent_contracts_0002.csv

Writes data/shared/rent_monthly.csv and data/shared/rent_quality_report.json. Only single-property
residential contracts for flats and villas are kept, so a rent belongs to one home. Every removed
row is counted. Nothing is estimated: a contract under 10 m2 keeps its rent but gets no rent per m2.
"""
import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

SHARED = Path('data/shared')
COLUMNS = ['contract_id', 'line_number', 'area_name_en', 'annual_amount', 'contract_start_date',
           'contract_reg_type_en', 'ejari_property_type_en', 'property_usage_en', 'no_of_prop', 'actual_area']
KIND = {'Flat': 'Apartment', 'Studio': 'Apartment', 'Villa': 'Villa', 'Complex Villas': 'Villa'}
CONTRACT_TYPE = {'New': 'New', 'Renew': 'Renewal'}
MIN_AREA_M2 = 10


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def clean(raw, today=None):
    """Return single-home residential rents and mutually exclusive removal counts."""
    today = today or pd.Timestamp.now(tz='Asia/Dubai').tz_localize(None).normalize()
    stats = {'input_rows': len(raw)}
    df = raw.drop_duplicates()
    stats['duplicate_rows'] = stats['input_rows'] - len(df)
    # One contract can cover several homes on several lines; its amount is not one home's rent.
    multi = df.contract_id.duplicated(keep=False) | pd.to_numeric(df.no_of_prop, errors='coerce').ne(1)
    stats['multi_property_rows'] = int(multi.sum())
    df = df.loc[~multi]
    usage = df.property_usage_en.astype('string').str.strip()
    kind = df.ejari_property_type_en.astype('string').str.strip().map(KIND)
    not_home = usage.ne('Residential').fillna(True) | kind.isna()
    stats['not_residential_home_rows'] = int(not_home.sum())
    df, kind = df.loc[~not_home], kind.loc[~not_home]
    start = pd.to_datetime(df.contract_start_date, errors='coerce', format='%Y-%m-%d')
    rent = pd.to_numeric(df.annual_amount, errors='coerce')
    contract = df.contract_reg_type_en.astype('string').str.strip().map(CONTRACT_TYPE)
    invalid = start.isna() | start.gt(today) | ~rent.gt(0) | contract.isna() | df.area_name_en.isna()
    stats['invalid_rows'] = int(invalid.sum())
    keep = ~invalid
    area_m2 = pd.to_numeric(df.actual_area, errors='coerce')
    out = pd.DataFrame({'area': df.area_name_en.astype('string').str.strip(), 'property_kind': kind,
                        'contract_type': contract, 'month': start.dt.strftime('%Y-%m'),
                        'annual_rent_aed': rent, 'area_m2': area_m2.where(area_m2 > 0)}).loc[keep]
    small = out.area_m2.lt(MIN_AREA_M2)
    stats['small_area_rows'] = int(small.sum())
    out['rent_per_m2_aed'] = (out.annual_rent_aed / out.area_m2).mask(small)
    stats['output_rows'] = len(out)
    return out, stats


def summarise(rents):
    """Monthly medians per area, flat or villa, and new or renewed contract."""
    return (rents.groupby(['area', 'property_kind', 'contract_type', 'month']).agg(
        contract_count=('annual_rent_aed', 'size'), median_annual_rent_aed=('annual_rent_aed', 'median'),
        median_area_m2=('area_m2', 'median'), median_rent_per_m2_aed=('rent_per_m2_aed', 'median'))
        .reset_index())


def prepare(inputs, output_dir=SHARED, today=None):
    raw = pd.concat([pd.read_csv(p, usecols=COLUMNS, dtype={'contract_id': 'string'}) for p in inputs],
                    ignore_index=True)
    rents, stats = clean(raw, today)
    if rents.empty:
        raise ValueError(f'No usable rent contracts. Counts: {stats}')
    monthly = summarise(rents)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    monthly.to_csv(output_dir / 'rent_monthly.csv', index=False)
    report = {**stats, 'monthly_rows': len(monthly), 'month_min': rents.month.min(), 'month_max': rents.month.max(),
              'contract_types': rents.contract_type.value_counts().to_dict(),
              'inputs': [{'file': Path(p).name, 'sha256': sha256(p)} for p in inputs],
              'coverage_note': 'Contracts in the supplied export only; DLD press totals are higher, so this may '
                               'not be every Ejari contract.',
              'prepared_at_utc': pd.Timestamp.now(tz='UTC').isoformat(), 'pandas_version': pd.__version__}
    (output_dir / 'rent_quality_report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, nargs='+', required=True, help='all parts of one rent export')
    parser.add_argument('--output-dir', type=Path, default=SHARED)
    args = parser.parse_args()
    try:
        report = prepare(args.input, args.output_dir)
    except (ValueError, OSError, pd.errors.ParserError) as exc:
        parser.exit(1, f'Rent preparation failed: {exc}\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'inputs'}, indent=2))


if __name__ == '__main__':
    main()
