"""Read the saved news snapshot: latest stories by topic, area or source type.

    python -m src.news.news                          # latest 20 stories
    python -m src.news.news --topic infrastructure
    python -m src.news.news --area "Dubai Marina"    # DLD name or the name people use

For the agent, NEWS_TOOL is an OpenAI tool definition in the same format as the team's TOOLS; call
get_news(**arguments) when the model asks for it.
"""
import argparse
from datetime import datetime, timedelta, timezone
import difflib
import json
from pathlib import Path

from .fetch import OUTPUT
from .tag import TOPICS, area_index

FIELDS = ['published', 'title', 'summary', 'source_name', 'tier', 'topic', 'areas', 'price_effect',
          'price_effect_reason', 'link', 'tagged_by']


def load_news(path=OUTPUT):
    path = Path(path)
    if not path.exists():
        raise ValueError('news.json is missing. Run python -m src.news.fetch first.')
    return json.loads(path.read_text(encoding='utf-8'))


def resolve_area(area, index=None):
    """The DLD area for a DLD name or a name people use. Exact match, any case; suggestions if none."""
    index = area_index() if index is None else index
    key = ' '.join(str(area).split()).casefold()
    found = {dld for phrase, dld in index.items() if phrase.casefold() == key}
    if len(found) == 1:
        return found.pop()
    if len(found) > 1:
        raise ValueError(f'"{area}" matches several DLD areas: {sorted(found)}. Use the DLD name.')
    close = difflib.get_close_matches(str(area), list(index), n=3, cutoff=0.6)
    raise ValueError(f'No area called "{area}".' + (f' Did you mean: {", ".join(close)}?' if close else ''))


def latest_news(topic=None, area=None, tier=None, days=90, limit=20, news=None, index=None, now=None):
    """Newest first. Every story keeps its source name, link and whether it is official or press."""
    news = news or load_news()
    if topic is not None and topic not in TOPICS:
        raise ValueError(f'topic must be one of {TOPICS}.')
    if tier is not None and tier not in ('official', 'press'):
        raise ValueError('tier must be "official" or "press".')
    dld = resolve_area(area, index) if area else None
    since = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    rows = [i for i in news['items']
            if (topic is None or i['topic'] == topic) and (tier is None or i['tier'] == tier)
            and (dld is None or dld in i['areas'])
            and i['published'] and datetime.fromisoformat(i['published'].replace('Z', '+00:00')) >= since]
    rows.sort(key=lambda i: i['published'], reverse=True)
    return {'fetched_at': news['fetched_at'], 'area': dld, 'count': len(rows[:limit]),
            'items': [{k: i.get(k) for k in FIELDS} for i in rows[:limit]],
            'note': 'Stories from approved sources only. price_effect is what the story implies, not a forecast.'}


def news_for_area(area, days=90, limit=10, **kwargs):
    return latest_news(area=area, days=days, limit=limit, **kwargs)


def get_news(topic=None, area=None, tier=None, days=90, limit=10):
    """Entry point for the agent's tool call. Errors come back as a message the model can read."""
    try:
        return latest_news(topic=topic, area=area, tier=tier, days=days, limit=min(int(limit), 20))
    except ValueError as exc:
        return {'error': str(exc)}


NEWS_TOOL = {
    'type': 'function',
    'function': {
        'name': 'get_news',
        'description': ('Recent Dubai real-estate and city news from approved sources only (Dubai Land Department, '
                        'Dubai Media Office, WAM, RTA, Dubai Municipality, Gulf News, Khaleej Times, The National, '
                        'Arabian Business, Zawya). Use it for questions about what is happening that could affect '
                        'prices: new projects, metro and roads, visa rules, fees and market reports. Always cite the '
                        'source name and link; price_effect is what the story implies, not a forecast.'),
        'parameters': {
            'type': 'object',
            'properties': {
                'topic': {'type': 'string', 'enum': list(TOPICS)},
                'area': {'type': 'string', 'description': 'DLD area name or the name people use, e.g. Dubai Marina'},
                'tier': {'type': 'string', 'enum': ['official', 'press']},
                'days': {'type': 'integer', 'minimum': 1, 'maximum': 90, 'default': 90},
                'limit': {'type': 'integer', 'minimum': 1, 'maximum': 20, 'default': 10},
            },
            'required': [],
        },
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--topic', choices=TOPICS)
    parser.add_argument('--area')
    parser.add_argument('--tier', choices=['official', 'press'])
    parser.add_argument('--days', type=int, default=90)
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    try:
        out = latest_news(args.topic, args.area, args.tier, args.days, args.limit)
    except ValueError as exc:
        parser.exit(1, f'{exc}\n')
    if args.json:
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return
    print(f"News snapshot {out['fetched_at']}: {out['count']} stories" + (f" for {out['area']}" if out['area'] else ''))
    for i in out['items']:
        effect = '' if i['price_effect'] == 'unclear' else f" [prices {i['price_effect']}]"
        print(f"{i['published'][:10]}  {i['tier']:<8} {i['topic']:<14} {i['title']}{effect}\n"
              f"            {i['source_name']}  {i['link']}")


if __name__ == '__main__':
    main()
