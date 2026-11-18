"""Tag news items: is it relevant, what topic, which areas, and what effect on prices it implies.

Keyword rules always run and decide relevance, so AI can never widen what is shown. When OPENAI_API_KEY is
set and AI is requested, gpt-4o (the team's model) refines each relevant item: a one-line summary written only
from the headline and snippet, the topic, the areas, and the price effect the article implies. Its answers are
checked against fixed lists; anything invalid, or any API error, falls back to the rules.
"""
import json
import os
from pathlib import Path
import re

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
TOPICS = ('infrastructure', 'regulation', 'supply', 'market_data', 'economy')
EFFECTS = ('up', 'down', 'unclear')
MODEL = 'gpt-4o'
BATCH = 20

# Strong terms make a headline relevant on their own; weak ones only when it also mentions Dubai.
KEYWORDS = {
    'infrastructure': {'strong': ['metro', 'blue line', 'etihad rail', 'air taxi', 'vertiport', 'tram',
                                  'al maktoum international', 'dubai world central'],
                       'weak': ['road', 'bridge', 'tunnel', 'interchange', 'airport', 'highway', 'salik', 'transport']},
    'regulation': {'strong': ['golden visa', 'rera', 'real estate law', 'property law',
                              'property fee', 'mortgage', 'ejari', 'title deed', 'escrow'],
                   'weak': ['visa', 'residency', 'law', 'rule', 'regulation', 'fee', 'decree', 'tax']},
    'supply': {'strong': ['off-plan', 'off plan', 'handover', 'villas', 'townhouses', 'apartments', 'master community',
                          'master plan', 'emaar', 'nakheel', 'damac', 'sobha', 'meraas', 'aldar', 'binghatti', 'ellington',
                          'azizi', 'danube properties', 'samana'],
               'weak': ['launch', 'project', 'developer', 'towers', 'units', 'homes', 'community']},
    'market_data': {'strong': ['real estate', 'property market', 'property prices', 'property transactions',
                               'property sales', 'home prices', 'rental market', 'property'],
                    'weak': ['transactions', 'prices', 'sales', 'record', 'billion', 'surge', 'decline', 'index']},
    'economy': {'strong': ['population growth', 'gdp', 'foreign direct investment'],
                'weak': ['economy', 'tourism', 'visitors', 'inflation', 'interest rate', 'investment', 'population']},
}


def _has(text, term):
    return re.search(r'(?<![a-z0-9])' + re.escape(term) + r'(?![a-z0-9])', text) is not None


def rule_topic(text):
    """Best topic by keyword hits (strong count double), and whether the headline is relevant at all."""
    low = text.lower()
    dubai = _has(low, 'dubai')
    scores = {}
    for topic, terms in KEYWORDS.items():
        strong = sum(_has(low, t) for t in terms['strong'])
        weak = sum(_has(low, t) for t in terms['weak']) if dubai else 0
        scores[topic] = 2 * strong + weak
    best = max(TOPICS, key=lambda t: scores[t])      # ties follow TOPICS order
    return (best, True) if scores[best] > 0 else (None, False)


def area_index(root=ROOT):
    """{phrase as people write it: DLD area}. DLD names plus the team's common names, split on ',' and '/'."""
    phrases = {}
    sales = Path(root) / 'data/shared/monthly_sales.csv'
    if sales.exists():
        for area in pd.read_csv(sales, usecols=['area']).area.dropna().unique():
            phrases[area] = area
    try:
        from src.market_data import load_area_names
        names = load_area_names()
    except (ImportError, OSError, ValueError):
        names = {}
    for area, common in names.items():
        for part in re.split(r'[,/]', str(common)):
            part = part.strip()
            if len(part) >= 4:
                phrases.setdefault(part, area)
    return phrases


def match_areas(text, index):
    """DLD areas whose name appears as a whole phrase. Longer names first, so a name inside a longer one is not
    counted twice (no partial matches)."""
    low = text.lower()
    found = []
    for phrase in sorted(index, key=len, reverse=True):
        pattern = r'(?<![a-z0-9])' + re.escape(phrase.lower()) + r'(?![a-z0-9])'
        if re.search(pattern, low):
            low = re.sub(pattern, ' ', low)
            if index[phrase] not in found:
                found.append(index[phrase])
    return found


def tag_by_rules(item, index):
    text = f"{item['title']} {item.get('snippet', '')}"
    topic, relevant = rule_topic(text)
    return {**item, 'relevant': relevant, 'topic': topic, 'areas': match_areas(text, index),
            'summary': item['title'], 'price_effect': 'unclear', 'price_effect_reason': None, 'tagged_by': 'rules'}


PROMPT = """You tag Dubai news headlines for a property advisor. Use ONLY the headline and snippet given; do not add
facts. For each item return: "id"; "summary" (one plain sentence, max 30 words, from the given text only);
"topic" (one of {topics}); "areas" (Dubai areas named in the text, exactly as written, else []);
"price_effect" (one of up, down, unclear: the effect on property prices that the text itself implies;
unclear unless the text clearly supports a direction); "reason" (max 20 words quoting or paraphrasing the text).
Reply as JSON: {{"items": [...]}}."""


def _client():
    if not os.environ.get('OPENAI_API_KEY'):
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    return OpenAI(timeout=60)


def _apply_ai(tagged, answer, index):
    """Merge one validated AI answer into a rule-tagged item. Invalid fields keep the rule values."""
    lookup = {k.lower(): v for k, v in index.items()}
    out = dict(tagged)
    summary = answer.get('summary')
    if isinstance(summary, str) and 0 < len(summary) <= 300:
        out['summary'] = summary.strip()
    if answer.get('topic') in TOPICS:
        out['topic'] = answer['topic']
    areas = answer.get('areas')
    if isinstance(areas, list):       # only names we know; anything else is dropped, never invented
        known = [lookup[a.strip().lower()] for a in areas if isinstance(a, str) and a.strip().lower() in lookup]
        out['areas'] = list(dict.fromkeys(tagged['areas'] + known))
    effect = answer.get('price_effect')
    out['price_effect'] = effect if effect in EFFECTS else 'unclear'
    reason = answer.get('reason')
    out['price_effect_reason'] = reason.strip() if out['price_effect'] != 'unclear' and isinstance(reason, str) \
        and 0 < len(reason) <= 200 else None
    out['tagged_by'] = 'ai'
    return out


def ai_refine(tagged, index, client):
    """Refine relevant items in batches. A failed batch keeps its rule tags."""
    out = list(tagged)
    for start in range(0, len(out), BATCH):
        batch = out[start:start + BATCH]
        payload = [{'id': i, 'headline': t['title'], 'snippet': t.get('snippet', '')} for i, t in enumerate(batch)]
        try:
            response = client.chat.completions.create(
                model=MODEL, temperature=0, response_format={'type': 'json_object'},
                messages=[{'role': 'system', 'content': PROMPT.format(topics=', '.join(TOPICS))},
                          {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}])
            answers = json.loads(response.choices[0].message.content)['items']
        except Exception:        # any API, network or format problem: keep the rule tags for this batch
            continue
        for answer in answers if isinstance(answers, list) else []:
            i = answer.get('id') if isinstance(answer, dict) else None
            if isinstance(i, int) and 0 <= i < len(batch):
                out[start + i] = _apply_ai(batch[i], answer, index)
    return out


def tag_items(items, use_ai=False, client=None, index=None):
    """Relevant items only, each tagged. AI is used when asked for and a client (or API key) is available."""
    index = area_index() if index is None else index
    tagged = [t for t in (tag_by_rules(i, index) for i in items) if t['relevant']]
    client = client or (_client() if use_ai else None)
    if use_ai and client is not None:
        tagged = ai_refine(tagged, index, client)
    for t in tagged:
        t.pop('relevant', None)
    return tagged
