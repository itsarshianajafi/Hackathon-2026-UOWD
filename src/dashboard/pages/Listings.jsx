import { useMemo, useState } from 'react'
import listingsFile from '@/data/listings.json'
import Icon from '../components/Icon'
import { Ring } from '../components/Charts'
import { CountUp, Segmented } from '../components/ui'
import { useApp } from '../lib/store'

const aed = (n) => `AED ${Math.round(n).toLocaleString('en-US')}`
const BEDS = ['Studio', '1 bed', '2 beds', '3 beds', '4 beds']
const TONE = { Rising: 'up', Stable: 'sage', Declining: 'down' }
const BUDGETS = [
  { key: '1m', label: 'Under 1M', max: 1_000_000 },
  { key: '2m', label: 'Under 2M', max: 2_000_000 },
  { key: '5m', label: 'Under 5M', max: 5_000_000 },
  { key: 'all', label: 'Any price', max: Infinity },
]
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/** The original skyline art: taller towers for more bedrooms, a hue per area. */
function Building({ l }) {
  const floors = Math.min(6, 3 + l.beds)
  const cols = 4
  const lit = Math.round(((hash(l.id) % 50) / 100 + 0.4) * floors * cols)
  return (
    <div className="pr-art" style={{ '--h': hash(l.area) }}>
      <i className="pr-sun" />
      <div className="pr-tower" style={{ '--f': floors }}>
        {Array.from({ length: floors * cols }, (_, k) => (
          <span key={k} className={k < lit ? 'on' : ''} style={{ '--k': k }} />
        ))}
      </div>
      <div className="pr-side" />
    </div>
  )
}

export default function Listings() {
  const { ask, booting } = useApp()
  const [budget, setBudget] = useState('2m')
  const max = BUDGETS.find((b) => b.key === budget).max
  const rows = useMemo(() => listingsFile.rows.filter((l) => l.price_aed <= max).sort((a, b) => a.price_aed - b.price_aed), [max])
  const perM2 = rows.map((l) => l.price_m2_aed).sort((a, b) => a - b)
  const median = perM2.length ? perM2[Math.floor(perM2.length / 2)] : 0
  const rising = rows.filter((l) => l.area_trend === 'Rising').length

  return (
    <>
      <div className="pr-summary">
        {[
          { label: 'Homes in budget', v: rows.length, f: (n) => Math.round(n).toLocaleString('en-US'), icon: 'building' },
          { label: 'Lowest price', v: rows[0]?.price_aed ?? 0, f: aed, icon: 'moneybag' },
          { label: 'Median price per m²', v: median, f: aed, icon: 'bars' },
          { label: 'In rising areas', v: rising, f: (n) => Math.round(n).toLocaleString('en-US'), icon: 'trend' },
        ].map((s, i) => (
          <section key={s.label} className="card cl-stat" style={{ '--d': `${i * 70}ms` }}>
            <span className="kpi-ic rv" style={{ '--i': 0 }}>
              <Icon name={s.icon} size={19} />
            </span>
            <div className="rv" style={{ '--i': 1 }}>
              <small>{s.label}</small>
              <strong>
                <CountUp value={s.v} format={s.f} delay={(booting ? 900 : 250) + i * 80} />
              </strong>
            </div>
          </section>
        ))}
      </div>

      <div className="page-bar">
        <span className="card-sub">Demo listings: synthetic, priced from DLD price per m² for {listingsFile.quarter}, flats and villas</span>
        <Segmented items={BUDGETS} value={budget} onChange={setBudget} />
      </div>

      <div className="pr-grid">
        {rows.slice(0, 24).map((l, i) => (
          <section key={l.id} className="card pr-card" style={{ '--d': `${160 + Math.min(i, 8) * 60}ms` }}>
            <Building l={l} />
            <div className="pr-body">
              <div className="pr-top rv" style={{ '--i': 0 }}>
                <div>
                  <h3>{l.title}</h3>
                  <small>
                    <Icon name="pin" size={13} /> {l.name !== l.area ? `${l.name} · ${l.area}` : l.name}
                  </small>
                </div>
                {Number.isFinite(max) ? (
                  <Ring value={Math.min(1, l.price_aed / max)} size={54} stroke={6}>
                    <b className="ring-pct" title="Share of your budget">
                      {Math.round((100 * l.price_aed) / max)}%
                    </b>
                  </Ring>
                ) : null}
              </div>
              <div className="pr-stats rv" style={{ '--i': 1 }}>
                <div>
                  <small>Price</small>
                  <strong>{aed(l.price_aed)}</strong>
                </div>
                <div>
                  <small>{l.registration}</small>
                  <strong>
                    {BEDS[l.beds]} · {l.size_m2} m²
                  </strong>
                </div>
                <div>
                  <small>Area</small>
                  <strong>{l.area_trend ? <span className={`pill-tag ${TONE[l.area_trend]}`}>{l.area_trend}</span> : '—'}</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn sm ghost block rv"
                style={{ '--i': 2 }}
                onClick={() => ask(`Tell me about listing ${l.id}, the ${l.title}, and the outlook for ${l.name}. Offer to book a viewing.`)}
              >
                <Icon name="sparkle" size={14} /> Ask Estaro about it
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
