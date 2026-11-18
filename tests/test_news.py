"""News feature: approved sources only, cleaning, relevance, areas, AI tagging with fallback, reading. No network."""
from datetime import datetime, timezone
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

from src.news import fetch as F
from src.news import tag as T
from src.news import news as N

NOW = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
SOURCES = {'gulfnews.com': ('Gulf News', 'press'), 'dubailand.gov.ae': ('Dubai Land Department', 'official'),
           'wam.ae': ('WAM', 'official')}
INDEX = {'Marsa Dubai': 'Marsa Dubai', 'Dubai Marina': 'Marsa Dubai', 'Palm Jumeirah': 'Palm Jumeirah',
         'Al Barsha South Fourth': 'Al Barsha South Fourth', 'Jumeirah Village Circle': 'Al Barsha South Fourth',
         'Al Barsha First': 'Al Barsha First'}


def item_xml(title, source_url, source_name, date='Tue, 17 Nov 2026 08:00:00 GMT', link='https://news.google.com/a'):
    return (f'<item><title>{title} - {source_name}</title><link>{link}</link><pubDate>{date}</pubDate>'
            f'<description>&lt;a href="x"&gt;{title}&lt;/a&gt;</description>'
            f'<source url="{source_url}">{source_name}</source></item>')


def feed(*items):
    return f'<?xml version="1.0"?><rss><channel><title>t</title>{"".join(items)}</channel></rss>'


SAMPLE = feed(
    item_xml('Dubai Metro Blue Line to reach Dubai Marina by 2029', 'https://gulfnews.com', 'Gulf News'),
    item_xml('Dubai Land Department - Dubai property transactions surge 31% to AED 252 billion in Q1 - دائرة الأراضي والأملاك',
             'https://dubailand.gov.ae', 'دائرة الأراضي والأملاك'),
    item_xml('Dubai Land Department - Application Status Enquiry for brokers today', 'https://dubailand.gov.ae', 'DLD'),
    item_xml('Open Data', 'https://dubailand.gov.ae', 'DLD'),
    item_xml('Property prices in Dubai hit a fresh record high this month', 'https://gulfnews.com.evil.io', 'Fake'),
    item_xml('Old story about Dubai property transactions in the year 2022', 'https://wam.ae', 'WAM'),
    item_xml('Dubai property market cools as listings rise sharply in autumn', 'https://wam.ae', 'WAM',
             date='Tue, 01 Jan 2025 08:00:00 GMT'),
    item_xml('Dubai Metro Blue Line to reach Dubai Marina by 2029!', 'https://www.gulfnews.com', 'Gulf News',
             date='Mon, 16 Nov 2026 08:00:00 GMT'))


class TestSources(unittest.TestCase):
    def test_approved_domains_and_subdomains_only(self):
        self.assertEqual(F.approved('https://gulfnews.com/x', SOURCES)[2], 'press')
        self.assertEqual(F.approved('https://www.gulfnews.com', SOURCES)[0], 'gulfnews.com')
        for bad in ('https://gulfnews.com.evil.io', 'https://notgulfnews.com', 'https://evil.io/gulfnews.com', ''):
            self.assertIsNone(F.approved(bad, SOURCES))

    def test_sources_file(self):
        sources = F.load_sources()
        self.assertEqual({t for _, t in sources.values()}, {'official', 'press'})
        self.assertIn('dubailand.gov.ae', sources)

    def test_feed_url_limits_to_given_sites(self):
        url = F.feed_url('Dubai metro', SOURCES)
        for domain in SOURCES:
            self.assertIn(f'site%3A{domain}', url)


class TestParse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kept, cls.dropped = F.parse_feed(SAMPLE, SOURCES, 'market', now=NOW)

    def test_drops_and_reasons(self):
        self.assertEqual(self.dropped, {'unapproved_source': 1, 'too_old_or_undated': 2, 'not_an_article': 2})
        self.assertEqual(len(self.kept), 3)

    def test_titles_are_cleaned(self):
        titles = [k['title'] for k in self.kept]
        self.assertIn('Dubai property transactions surge 31% to AED 252 billion in Q1', titles)
        self.assertIn('Dubai Metro Blue Line to reach Dubai Marina by 2029', titles)
        self.assertTrue(all(' - Gulf News' not in t for t in titles))

    def test_fields(self):
        dld = next(k for k in self.kept if k['source_domain'] == 'dubailand.gov.ae')
        self.assertEqual((dld['tier'], dld['source_name'], dld['published']),
                         ('official', 'Dubai Land Department', '2026-11-17T08:00:00Z'))
        self.assertEqual(dld['snippet'], '')          # Google's description only repeats the headline

    def test_dedupe_keeps_newest_copy(self):
        unique = F.dedupe(self.kept)
        self.assertEqual(len(unique), 2)
        metro = [u for u in unique if 'Metro' in u['title']]
        self.assertEqual(metro[0]['published'], '2026-11-17T08:00:00Z')


class TestFetch(unittest.TestCase):
    def test_runs_official_and_press_separately_and_reports_failures(self):
        calls = []

        def fake_get(url):
            calls.append(url)
            if len(calls) == 3:
                raise OSError('network down')
            return SAMPLE

        items, report = F.fetch(SOURCES, get=fake_get, pause=0, now=NOW)
        self.assertEqual(len(calls), 2 * len(F.TOPIC_QUERIES))
        self.assertEqual(len(report['failed_queries']), 1)
        self.assertEqual(len(items), 2)
        self.assertGreater(report['duplicates_removed'], 0)

    def test_retries_when_rate_limited(self):
        attempts = []

        def flaky(url):
            attempts.append(url)
            if len(attempts) == 1:
                raise HTTPError(url, 429, 'Too Many Requests', None, None)
            return SAMPLE

        F.time.sleep, original = (lambda s: None), F.time.sleep
        try:
            self.assertEqual(F._get_politely(flaky, 'u', pause=1), SAMPLE)
        finally:
            F.time.sleep = original
        self.assertEqual(len(attempts), 2)


class TestRules(unittest.TestCase):
    def test_relevance_and_topic(self):
        self.assertEqual(T.rule_topic('Dubai Metro Blue Line extension approved'), ('infrastructure', True))
        self.assertEqual(T.rule_topic('Nakheel launches villas and townhouses'), ('supply', True))
        self.assertEqual(T.rule_topic('Golden Visa rules updated for investors'), ('regulation', True))
        self.assertEqual(T.rule_topic('GTA 6 launches after 13 years'), (None, False))       # weak word, no Dubai
        self.assertEqual(T.rule_topic('Emirati inventor builds AI to warn riders of road hazards'), (None, False))
        self.assertEqual(T.rule_topic('Dubai opens new road interchange'), ('infrastructure', True))

    def test_areas_exact_whole_phrase_longest_first(self):
        self.assertEqual(T.match_areas('New homes in Jumeirah Village Circle and Dubai Marina', INDEX),
                         ['Al Barsha South Fourth', 'Marsa Dubai'])
        self.assertEqual(T.match_areas('Al Barsha South Fourth villas', INDEX), ['Al Barsha South Fourth'])
        self.assertEqual(T.match_areas('Palm Jumeirahs and Marinas', INDEX), [])       # no partial words
        self.assertEqual(T.match_areas('Dubai Marina and Marsa Dubai', INDEX), ['Marsa Dubai'])

    def test_rules_never_guess_a_price_direction(self):
        tagged = T.tag_items([{'title': 'Dubai property prices surge to record in Palm Jumeirah', 'snippet': ''}],
                             index=INDEX)
        self.assertEqual((tagged[0]['price_effect'], tagged[0]['tagged_by']), ('unclear', 'rules'))
        self.assertEqual(tagged[0]['areas'], ['Palm Jumeirah'])

    def test_off_topic_items_are_removed(self):
        tagged = T.tag_items([{'title': 'Celebrity shares cryptic post about co-star'}], index=INDEX)
        self.assertEqual(tagged, [])


class FakeClient:
    """Stands in for OpenAI: returns the given answer (or raises) for every batch."""

    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.calls = answer, error, 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        content = self.answer if isinstance(self.answer, str) else json.dumps(self.answer)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


ITEMS = [{'title': 'Dubai Metro Blue Line to reach Dubai Marina by 2029', 'snippet': ''},
         {'title': 'Dubai property transactions surge 31% to AED 252 billion', 'snippet': ''}]


class TestAI(unittest.TestCase):
    def test_valid_answers_are_applied_and_checked(self):
        client = FakeClient({'items': [
            {'id': 0, 'summary': 'The Blue Line will reach Dubai Marina in 2029.', 'topic': 'infrastructure',
             'areas': ['Dubai Marina', 'Atlantis City'], 'price_effect': 'up', 'reason': 'New metro access to Marina.'},
            {'id': 1, 'summary': 'Sales rose 31%.', 'topic': 'flying_cars', 'areas': 'Palm',
             'price_effect': 'sideways', 'reason': 'x'}]})
        tagged = T.tag_items(ITEMS, use_ai=True, client=client, index=INDEX)
        metro, sales = tagged
        self.assertEqual((metro['tagged_by'], metro['topic'], metro['price_effect']), ('ai', 'infrastructure', 'up'))
        self.assertEqual(metro['areas'], ['Marsa Dubai'])                  # unknown "Atlantis City" dropped
        self.assertEqual(sales['topic'], 'market_data')                    # invalid topic keeps the rule topic
        self.assertEqual((sales['price_effect'], sales['price_effect_reason']), ('unclear', None))
        self.assertEqual(client.calls, 1)

    def test_errors_and_bad_json_fall_back_to_rules(self):
        for client in (FakeClient(error=RuntimeError('timeout')), FakeClient('not json'), FakeClient({'items': 'x'})):
            tagged = T.tag_items(ITEMS, use_ai=True, client=client, index=INDEX)
            self.assertEqual({t['tagged_by'] for t in tagged}, {'rules'})

    def test_no_key_means_rules(self):
        T._client, original = (lambda: None), T._client
        try:
            tagged = T.tag_items(ITEMS, use_ai=True, index=INDEX)
        finally:
            T._client = original
        self.assertEqual({t['tagged_by'] for t in tagged}, {'rules'})

    def test_ai_cannot_add_items_rules_removed(self):
        client = FakeClient({'items': [{'id': 0, 'summary': 'x', 'topic': 'supply', 'areas': [], 'price_effect': 'up'}]})
        tagged = T.tag_items([{'title': 'Celebrity news of the day'}], use_ai=True, client=client, index=INDEX)
        self.assertEqual(tagged, [])
        self.assertEqual(client.calls, 0)


def snapshot(items):
    return {'fetched_at': '2026-11-18T12:00:00Z', 'items': items}


def story(title, published, topic='market_data', tier='press', areas=()):
    return {'title': title, 'summary': title, 'published': published, 'topic': topic, 'tier': tier,
            'areas': list(areas), 'source_name': 'Gulf News', 'link': 'https://news.google.com/x',
            'price_effect': 'unclear', 'price_effect_reason': None, 'tagged_by': 'rules'}


class TestRead(unittest.TestCase):
    NEWS = snapshot([story('A', '2026-11-17T08:00:00Z', 'infrastructure', 'official', ['Marsa Dubai']),
                     story('B', '2026-11-10T08:00:00Z', 'supply', 'press', ['Palm Jumeirah']),
                     story('C', '2026-07-01T08:00:00Z', 'market_data', 'press')])

    def read(self, **kw):
        return N.latest_news(news=self.NEWS, index=INDEX, now=NOW, **kw)

    def test_filters_and_order(self):
        self.assertEqual([i['title'] for i in self.read()['items']], ['A', 'B'])       # C is older than 90 days
        self.assertEqual([i['title'] for i in self.read(days=200)['items']], ['A', 'B', 'C'])
        self.assertEqual([i['title'] for i in self.read(topic='supply')['items']], ['B'])
        self.assertEqual([i['title'] for i in self.read(tier='official')['items']], ['A'])
        self.assertEqual(self.read(limit=1)['count'], 1)

    def test_area_by_common_name(self):
        out = self.read(area='dubai marina')
        self.assertEqual((out['area'], [i['title'] for i in out['items']]), ('Marsa Dubai', ['A']))
        with self.assertRaisesRegex(ValueError, 'Did you mean'):
            self.read(area='Dubai Marinaa')

    def test_bad_filters(self):
        with self.assertRaises(ValueError):
            self.read(topic='gossip')
        with self.assertRaises(ValueError):
            self.read(tier='blog')

    def test_tool_definition_and_entry_point(self):
        self.assertEqual(N.NEWS_TOOL['function']['name'], 'get_news')
        self.assertEqual(N.NEWS_TOOL['function']['parameters']['properties']['topic']['enum'], list(T.TOPICS))
        self.assertIn('error', N.get_news(topic='gossip'))

    def test_save_and_load_round_trip(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'news.json'
            F.save([story('A', '2026-11-17T08:00:00Z')], {'dropped': {}, 'failed_queries': []}, path)
            loaded = N.load_news(path)
        self.assertEqual(loaded['items'][0]['title'], 'A')
        self.assertIn('fetched_at', loaded)


@unittest.skipUnless(F.OUTPUT.exists(), 'news snapshot not built')
class TestSnapshot(unittest.TestCase):
    def test_saved_snapshot_is_clean(self):
        news = N.load_news()
        sources = F.load_sources()
        self.assertGreater(len(news['items']), 10)
        for item in news['items']:
            self.assertIn(item['source_domain'], sources)
            self.assertEqual(item['tier'], sources[item['source_domain']][1])
            self.assertIn(item['topic'], T.TOPICS)
            self.assertIn(item['price_effect'], T.EFFECTS)
            self.assertTrue(item['published'] and item['link'])


if __name__ == '__main__':
    unittest.main()
