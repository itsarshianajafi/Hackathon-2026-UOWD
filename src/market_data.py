"""Read a coherent set of shared outputs without changing source files."""
import json
from pathlib import Path

import pandas as pd

from src.forecasting.data import fingerprint
from src.forecasting.run import validate_output

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / 'data/shared'
FILES = ['monthly_sales.csv', 'quality_report.json', 'market_trends.csv',
         'forecasts.csv', 'forecast_manifest.json']


def source_signature():
    """Capture the inputs used to load the market snapshot."""
    paths = [SHARED / name for name in FILES]
    paths += [path for path in [SHARED / 'area_names.csv'] if path.exists()]
    return tuple((str(path), path.stat().st_mtime_ns, path.stat().st_size) for path in paths)


def load_bundle():
    """Validate source fingerprints before exposing the market snapshot."""
    before = source_signature()
    quality = json.loads((SHARED / 'quality_report.json').read_text())
    forecast_manifest = json.loads((SHARED / 'forecast_manifest.json').read_text())
    for name, expected in forecast_manifest['source_hashes'].items():
        if fingerprint(ROOT / name) != expected:
            raise ValueError(f'{Path(name).name} differs from the saved analysis. Refresh the snapshot.')
    if fingerprint(SHARED / 'forecasts.csv') != forecast_manifest['output_sha256']:
        raise ValueError('forecasts.csv does not match its manifest. Regenerate the forecasts.')
    monthly = pd.read_csv(SHARED / 'monthly_sales.csv')
    if len(monthly) != quality['monthly_sales_rows'] or int(monthly.transaction_count.sum()) != quality['sales_transactions']:
        raise ValueError('Monthly sales do not reconcile with the quality report.')
    forecasts = pd.read_csv(SHARED / 'forecasts.csv', dtype={'schema_version': str})
    validate_output(forecasts, forecast_manifest)
    monthly['date'] = pd.to_datetime(monthly.month + '-01')
    trends = pd.read_csv(SHARED / 'market_trends.csv')
    if before != source_signature():
        raise ValueError('Source files changed while reading. Wait for the update to finish and refresh.')
    return dict(monthly=monthly, quality=quality, forecasts=forecasts,
                forecast_manifest=forecast_manifest,
                trends=trends, names=load_area_names())


def filter_rows(frame, area='All areas', registration='Both'):
    """Apply the same segment identity to each view; empty results remain empty."""
    selected = frame
    if area != 'All areas':
        selected = selected[selected.area.eq(area)]
    if registration != 'Both':
        selected = selected[selected.registration_type.eq(registration)]
    return selected.copy()


def monthly_summary(frame):
    """Sum counts and consideration; do not present averages of medians as medians."""
    return frame.groupby('date')[['transaction_count', 'total_price_aed']].sum().rename(
        columns={'transaction_count': 'Sales', 'total_price_aed': 'Transaction value (AED)'})


def load_area_names():
    """{DLD area: name people use}, from area_names.csv if Part 1 wrote one. Names equal to the area are left out."""
    path = SHARED / 'area_names.csv'
    if not path.exists():
        return {}
    names = pd.read_csv(path, keep_default_na=False)
    names = names[names.common_name.ne('') & names.common_name.str.casefold().ne(names.area.str.casefold())]
    return dict(zip(names.area, names.common_name))


def area_label(area, names):
    """'Dubai Marina (Marsa Dubai)': the name people use first, DLD's official name after it."""
    return f'{names[area]} ({area})' if area in names else area
