# Verified news

Recent stories about the Dubai property market, and about city changes that can move prices (metro and roads,
visa rules, fees and regulation, big project launches). Only approved sources are used, and each story is
labelled `official` or `press`.

## Commands

```bash
python -m src.news.fetch              # refresh data/shared/news.json (keyword tags)
python -m src.news.fetch --tag        # AI tags with gpt-4o when OPENAI_API_KEY is set; keyword rules otherwise
python -m src.news.news --topic infrastructure
python -m src.news.news --area "Dubai Marina"       # DLD name or the name people use
python -m unittest tests.test_news
```

## For the backend and agent (`src/news/news.py`)

| Name | What |
|---|---|
| `latest_news(topic, area, tier, days=90, limit=20)` | Newest stories first, with source name, link, tier, topic, areas and price effect |
| `news_for_area(area)` | Stories that name that area |
| `get_news(...)` | Entry point for a tool call; problems come back as `{"error": ...}` |
| `NEWS_TOOL` | OpenAI tool definition in the same format as the team's `TOOLS`; add it to the agent's tool list and route `get_news` to `get_news(**arguments)` |

An `/api/news` route can return `latest_news(...)` directly.

## Approved sources (`data/news_sources.csv`)

| Official | Press |
|---|---|
| Dubai Land Department, Government of Dubai Media Office, WAM, RTA, Dubai Municipality | Gulf News, Khaleej Times, The National, Arabian Business, Zawya |

Editing this file is the only way to add or remove a source.

## How it works

1. **Find.** The official sites build their news pages with JavaScript, so they cannot be read directly. Each
   topic (market, off-plan, infrastructure, residency, regulation) is searched through a Google News feed limited
   to the approved sites. Official and press sites are searched separately so neither crowds out the other.
2. **Keep only approved sources.** An item stays only if its original website is an approved domain or a
   subdomain of one (exact match, so `gulfnews.com.evil.io` is rejected).
3. **Drop what is not news.** Items older than 90 days, items naming an older year (old stories re-dated by
   the index), titles under six words, and official-site service pages ("Application Status Enquiry") are removed.
   Duplicates are merged.
4. **Keep only relevant stories.** Strong terms (off-plan, metro, golden visa, villas, property prices) count on
   their own. Weak terms (road, launch, fees) count only when the headline also mentions Dubai.
5. **Tag.**
   - Rules give the topic and the areas, matched as exact whole names (DLD names plus the team's common names,
     so "Dubai Marina" maps to Marsa Dubai). Rules never guess a price direction (`unclear`).
   - With an API key, gpt-4o adds a one-sentence summary written only from the headline and snippet, a topic,
     areas, and the price effect the story implies (`up`, `down` or `unclear`) with a short reason.
   - The AI's answers are checked against fixed lists, and unknown areas are dropped. Any error falls back to the
     rules. The AI can never add a story the rules removed.

## Snapshot (18 Nov 2026)

77 stories (12 official, 65 press) after removing 163 off-topic items, 188 old or undated ones, 78 website pages
and 23 duplicates. No item came from an unapproved site. Three sample links, opened in a browser, landed on the
matching sites (Gulf News, Arabian Business, Khaleej Times).

## Limits

- Google News is an aggregator. Its links redirect to the original article; the source shown is the original site.
- Google gives only headlines, so summaries and tags use the headline (and snippet, when there is one).
- Some noise remains, for example an event story that names a developer.
- Area matching is exact, so a story that spells an area differently is not linked to it.
- `price_effect` is what a story implies, not a forecast. News does not change any score.
- Google may refuse quick repeated requests ("429"); the fetcher pauses between queries and retries.
- `news.json` is a snapshot. Run the fetch command to refresh it.
