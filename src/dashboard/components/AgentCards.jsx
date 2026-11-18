import Icon from './Icon'
import { Delta } from './ui'

const aed = (n) => `AED ${Math.round(n).toLocaleString('en-US')}`
const whole = (n) => Math.round(n).toLocaleString('en-US')
const BEDS = ['Studio', '1 bed', '2 beds', '3 beds', '4 beds']
const TONE = { Rising: 'up', Stable: 'sage', Declining: 'down' }
const when = (slot) =>
  new Date(slot).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const MAX = 4

function ListingCard({ l, onAsk, i }) {
  return (
    <div className="ac-card" style={{ '--i': i }}>
      <div className="ac-top">
        <strong>{l.title}</strong>
        {l.area_trend ? <span className={`pill-tag ${TONE[l.area_trend]}`}>{l.area_trend}</span> : null}
      </div>
      <div className="ac-price">{aed(l.price_aed)}</div>
      <div className="ac-facts">
        {BEDS[l.beds]} · {l.size_m2} m² · {l.registration} · {l.id}
      </div>
      {l.reasons?.length ? <div className="ac-why">{l.reasons.join(' · ')}</div> : null}
      <button type="button" className="btn sm ghost" onClick={() => onAsk(`Book a viewing for listing ${l.id} on the first free slot`)}>
        <Icon name="calendar" size={13} /> Book a viewing
      </button>
    </div>
  )
}

function AreaCard({ a, onAsk, i }) {
  return (
    <button type="button" className="ac-card ac-area" style={{ '--i': i }} onClick={() => onAsk(`Find homes in ${a.name}`)}>
      <div className="ac-top">
        <strong>{a.name}</strong>
        {a.trend ? <span className={`pill-tag ${TONE[a.trend]}`}>{a.trend}</span> : null}
      </div>
      <div className="ac-facts">{a.registration}</div>
      <div className="ac-grid">
        <span>
          <small>Forecast sales</small>
          <b>{whole(a.forecast_sales)}</b>
          {a.sales_change != null ? <Delta value={a.sales_change * 100} dp={0} /> : null}
        </span>
        <span>
          <small>Price per m²</small>
          <b>{a.price_m2_last ? aed(a.price_m2_last) : '—'}</b>
          {a.price_m2_forecast && a.price_m2_last ? <Delta value={(a.price_m2_forecast / a.price_m2_last - 1) * 100} dp={1} /> : null}
        </span>
      </div>
    </button>
  )
}

function More({ n }) {
  return n > 0 ? <div className="ac-more">and {n} more</div> : null
}

/** Cards built from the agent's tool results, so every figure shown is the tool's own output. */
export default function AgentCards({ steps, onAsk }) {
  const last = (tool) => [...steps].reverse().find((s) => s.tool === tool)?.output
  const booked = steps.filter((s) => s.tool === 'book_viewing' && s.output?.ok).map((s) => s.output.viewing)
  const matched = last('match_buyer')?.matches
  const found = last('search_listings')?.listings
  const listings = booked.length ? [] : (matched ?? found ?? [])
  const areas = last('top_areas')?.areas ?? last('get_area_outlook')?.segments ?? []
  const slots = booked.length ? [] : (last('get_available_slots')?.slots ?? [])
  const viewings = last('list_viewings')?.viewings ?? []

  if (!booked.length && !listings.length && !areas.length && !slots.length && !viewings.length) return null
  return (
    <div className="agent-cards">
      {booked.map((v) => (
        <div key={v.id} className="ac-card ac-booked">
          <span className="ac-ic">
            <Icon name="checkCircle" size={18} />
          </span>
          <div>
            <small>Viewing booked · {v.id}</small>
            <strong>{v.title}</strong>
            <span className="ac-facts">
              {when(v.slot)} · for {v.buyer}
            </span>
          </div>
        </div>
      ))}
      {listings.slice(0, MAX).map((l, i) => (
        <ListingCard key={l.id} l={l} onAsk={onAsk} i={i} />
      ))}
      <More n={listings.length - MAX} />
      {areas.slice(0, MAX).map((a, i) => (
        <AreaCard key={`${a.area}-${a.registration}`} a={a} onAsk={onAsk} i={i} />
      ))}
      <More n={areas.length - MAX} />
      {slots.length ? (
        <div className="ac-slots">
          {slots.slice(0, 6).map((s) => (
            <button key={s} type="button" className="ac-slot" onClick={() => onAsk(`Book the viewing at ${s}`)}>
              {when(s)}
            </button>
          ))}
        </div>
      ) : null}
      {viewings.map((v) => (
        <div key={v.id} className="ac-card ac-booked">
          <span className="ac-ic">
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <small>{v.id}</small>
            <strong>{v.title}</strong>
            <span className="ac-facts">{when(v.slot)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
