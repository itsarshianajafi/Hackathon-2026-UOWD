"""Gather recent news from approved sources only and save a snapshot.

    python -m src.news.fetch            # fetch and save data/shared/news.json (keyword tags)
    python -m src.news.fetch --tag      # also AI tags when OPENAI_API_KEY is set (falls back to rules)

The official sites build their news pages with JavaScript, so they cannot be read directly. Stories are
found through Google News search feeds restricted to the approved websites in data/news_sources.csv, and an
item is kept only when its original source website is on that list. Editing that file is the only way to
add a source.
"""
import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import html
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import quote_plus, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / 'data/news_sources.csv'
OUTPUT = ROOT / 'data/shared/news.json'
FEED = 'https://news.google.com/rss/search?q={query}&hl=en-AE&gl=AE&ceid=AE:en'
# What can move Dubai property prices: the market itself and the big city changes around it.
TOPIC_QUERIES = {
    'market': 'Dubai ("real estate" OR "property market" OR "property prices" OR "property transactions")',
    'off_plan': 'Dubai (off-plan OR "project launch" OR handover OR villas OR townhouses OR "master community")',
    'infrastructure': 'Dubai (metro OR "Blue Line" OR "Etihad Rail" OR "air taxi" OR "new road" OR bridge OR '
                      '"Al Maktoum airport")',
    'residency': 'UAE ("golden visa" OR "residency visa" OR "visa rules" OR "property investors")',
    'regulation': 'Dubai ("Dubai Land Department" OR "property fees" OR "real estate law" OR RERA OR mortgage)',
}
WINDOW = 'when:90d'
MAX_AGE_DAYS = 90       # enforced here too: Google's date filter does not hold for indexed site pages
MIN_WORDS = 6           # shorter "headlines" are website page names (e.g. "Open Data"), not articles
PAUSE_SECONDS = 3       # between queries; Google answers 429 when asked too quickly
# Government websites are indexed as pages, not only news. Service pages read like these.
SERVICE_PAGE = re.compile(r'\b(application|applications|issuance|issue of|renewing|complaint|enquiry|inquiry|overview|'
                          r'practice card|guide|form|e-services?|how to apply|service charge index|open data)\b', re.I)


def load_sources(path=SOURCES):
    sources = pd.read_csv(path)
    if not set(sources.tier) <= {'official', 'press'}:
        raise ValueError('news_sources.csv: tier must be "official" or "press".')
    return {row.domain.strip().lower(): (row.name, row.tier) for row in sources.itertuples()}


def approved(url, sources):
    """(domain, name, tier) when the URL's host is an approved domain or a subdomain of one, else None.

    Exact suffix match on whole labels, so 'gulfnews.com.evil.io' and 'notgulfnews.com' are rejected.
    """
    host = (urlsplit(url).hostname or '').lower().rstrip('.')
    for domain, (name, tier) in sources.items():
        if host == domain or host.endswith('.' + domain):
            return domain, name, tier
    return None


def feed_url(query, sources):
    sites = ' OR '.join(f'site:{d}' for d in sources)
    return FEED.format(query=quote_plus(f'({query}) ({sites}) {WINDOW}'))


def _clean(text):
    text = html.unescape(re.sub(r'<[^>]+>', ' ', text or ''))
    return ' '.join(text.split())


def clean_title(title, source_text, site_name):
    """Strip what Google and the site add around a headline: ' - Source', 'Site Name - ', ' | Site', Arabic tails."""
    if source_text and title.endswith(f' - {source_text}'):
        title = title[:-len(source_text) - 3]
    for prefix in {site_name, source_text}:
        if prefix and title.lower().startswith(f'{prefix.lower()} - '):
            title = title[len(prefix) + 3:]
    title = re.split(r'\s+\|\s+', title)[0]
    parts = title.split(' - ')
    while len(parts) > 1 and not re.search('[A-Za-z]', parts[-1]):       # e.g. the Arabic site name
        parts.pop()
    return ' - '.join(parts).strip()


def parse_feed(xml_text, sources, topic, now=None):
    """Items from one RSS feed: (kept items, counts of what was dropped and why)."""
    now = now or datetime.now(timezone.utc)
    root = ET.fromstring(xml_text)
    kept, dropped = [], {'unapproved_source': 0, 'too_old_or_undated': 0, 'not_an_article': 0}
    for item in root.iter('item'):
        source = item.find('source')
        match = approved(source.get('url', '') if source is not None else '', sources)
        if match is None:
            dropped['unapproved_source'] += 1
            continue
        domain, name, tier = match
        title = clean_title(_clean(item.findtext('title')), (source.text or '').strip(), name)
        try:
            published = parsedate_to_datetime(item.findtext('pubDate')).astimezone(timezone.utc)
        except (TypeError, ValueError):
            published = None
        if published is None or (now - published).days > MAX_AGE_DAYS or published > now:
            dropped['too_old_or_undated'] += 1
            continue
        if len(title.split()) < MIN_WORDS or (tier == 'official' and SERVICE_PAGE.search(title)):
            dropped['not_an_article'] += 1
            continue
        years = [int(y) for y in re.findall(r'\b(20\d\d)\b', title)]
        if years and max(years) < now.year - 1:          # an old story re-dated by the index
            dropped['too_old_or_undated'] += 1
            continue
        snippet = _clean(item.findtext('description'))
        # Google's description usually just repeats the raw headline; keep it only when it adds text.
        kept.append({'title': title, 'snippet': '' if title in snippet else snippet,
                     'source_name': name, 'source_domain': domain, 'tier': tier,
                     'published': published.strftime('%Y-%m-%dT%H:%M:%SZ') if published else None,
                     'link': item.findtext('link'), 'topic_query': topic})
    return kept, dropped


def dedupe(items):
    """Keep the first copy of each headline (case and punctuation ignored), newest first."""
    items = sorted(items, key=lambda i: i['published'] or '', reverse=True)
    seen, out = set(), []
    for item in items:
        key = re.sub(r'[^a-z0-9]+', ' ', item['title'].lower()).strip()
        if key and key not in seen:
            seen.add(key)
            out.append(item)
    return out


def download(url, timeout=30):
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (news fetcher for a student project)'})
    with urlopen(request, timeout=timeout) as response:      # follows redirects
        return response.read().decode('utf-8', errors='replace')


def _get_politely(get, url, pause, retries=2):
    for attempt in range(retries + 1):
        try:
            return get(url)
        except HTTPError as exc:
            if exc.code != 429 or attempt == retries:
                raise
            time.sleep(pause * 10 * (attempt + 1))      # rate limited: back off, then try again


def fetch(sources=None, get=download, pause=PAUSE_SECONDS, now=None):
    """Run every topic query. Returns (items, report). `get` is injectable so tests need no network."""
    sources = sources or load_sources()
    items = []
    report = {'queries': {}, 'dropped': {'unapproved_source': 0, 'too_old_or_undated': 0, 'not_an_article': 0},
              'failed_queries': []}
    # Official and press sites are searched separately so neither crowds the other out of the results.
    groups = {tier: {d: v for d, v in sources.items() if v[1] == tier} for tier in ('official', 'press')}
    jobs = [(topic, tier, query) for topic, query in TOPIC_QUERIES.items() for tier in groups if groups[tier]]
    for n, (topic, tier, query) in enumerate(jobs):
        if n and pause:
            time.sleep(pause)
        try:
            text = _get_politely(get, feed_url(query, groups[tier]), pause)
            kept, dropped = parse_feed(text, sources, topic, now)
        except (OSError, ET.ParseError) as exc:
            report['failed_queries'].append({'topic': topic, 'tier': tier, 'error': str(exc)[:200]})
            continue
        items += kept
        for reason, count in dropped.items():
            report['dropped'][reason] += count
        report['queries'][f'{topic}/{tier}'] = {'query': query, 'kept': len(kept)}
    unique = dedupe(items)
    report['duplicates_removed'] = len(items) - len(unique)
    return unique, report


def save(items, report, path=OUTPUT):
    payload = {'fetched_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'window': WINDOW,
               'sources_file': 'data/news_sources.csv', **report, 'items': items,
               'note': 'Found through Google News search feeds limited to approved sites; links go through Google. '
                       'price_effect is what the article implies, not a forecast.'}
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--tag', action='store_true', help='AI tags when OPENAI_API_KEY is set; rules otherwise')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    from .tag import tag_items
    items, report = fetch()
    found = len(items)
    items = tag_items(items, use_ai=args.tag)
    report['off_topic_removed'] = found - len(items)
    if not items:
        parser.exit(1, f'No relevant approved news found; nothing saved. {json.dumps(report)}\n')
    payload = save(items, report, args.output)
    counts = pd.Series([i['tier'] for i in items]).value_counts().to_dict()
    print(json.dumps({'items': len(items), 'by_tier': counts, 'tagged_by': pd.Series([i['tagged_by'] for i in items])
                      .value_counts().to_dict(), **{k: payload[k] for k in ('dropped', 'duplicates_removed',
                                                                             'off_topic_removed', 'failed_queries')}},
                     indent=2))


if __name__ == '__main__':
    main()
