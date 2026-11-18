import { useMemo, useState } from 'react'
import newsFile from '@/data/news.json'
import { Segmented } from '../components/ui'

const NEWS_TOPICS = [
  { key: 'all', label: 'All' },
  { key: 'market_data', label: 'Market' },
  { key: 'supply', label: 'Supply' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'regulation', label: 'Regulation' },
]
const TOPIC_LABEL = { market_data: 'Market', supply: 'Supply', infrastructure: 'Infrastructure', regulation: 'Regulation', economy: 'Economy' }
const newsDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function News() {
  const [topic, setTopic] = useState('all')
  const items = useMemo(
    () => newsFile.items.filter((i) => topic === 'all' || i.topic === topic).sort((a, b) => b.published.localeCompare(a.published)).slice(0, 12),
    [topic],
  )
  const official = newsFile.items.filter((i) => i.tier === 'official').length
  return (
    <section className="card news-card" style={{ '--d': '120ms' }}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Verified news</h2>
          <span className="card-sub">
            {newsFile.items.length} stories from approved sources only ({official} official) · last 90 days · fetched {newsDay(newsFile.fetched_at)}
          </span>
        </div>
        <Segmented items={NEWS_TOPICS} value={topic} onChange={setTopic} />
      </div>
      <div className="news-grid" key={topic}>
        {items.map((n, i) => (
          <a key={n.link} className="news-item rv" style={{ '--i': i }} href={n.link} target="_blank" rel="noreferrer">
            <span className="news-meta">
              <span className={`pill-tag ${n.tier === 'official' ? 'up' : ''}`}>{n.tier === 'official' ? 'Official' : 'Press'}</span>
              {n.source_name} · {newsDay(n.published)}
            </span>
            <strong>{n.title}</strong>
            <small className="muted">{TOPIC_LABEL[n.topic] ?? n.topic}</small>
          </a>
        ))}
      </div>
    </section>
  )
}
