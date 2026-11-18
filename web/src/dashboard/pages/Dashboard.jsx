import { useEffect, useState } from 'react'
import kpi from '@/data/kpi.json'
import areasFile from '@/data/areas.json'
import Icon from '../components/Icon'
import { Donut, LineChart } from '../components/Charts'
import { Delta } from '../components/ui'
import { useApp } from '../lib/store'
import { STARTERS } from '../lib/nav'

const QUARTER = { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' }
const quarterName = (code) => `${QUARTER[code.slice(4)]} ${code.slice(0, 4)}`
const shortQuarter = (code) => `${code.slice(4)} ${code.slice(2, 4)}`
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (m) => `${MONTH[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`
const whole = (n) => Math.round(n).toLocaleString('en-US')
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : whole(n))
const LEAVE_MS = 220
const TYPE_COLORS = ['var(--sage)', 'var(--sand-ink)']

const latest = quarterName(kpi.latest_quarter)
const next = quarterName(kpi.forecast_quarter)

function KpiCard({ d, label, value, change, note }) {
  return (
    <section className="card stat-card kpi-card" style={{ '--d': d }}>
      <div className="stat-txt">
        <span className="stat-label rv" style={{ '--i': 0 }}>
          {label}
        </span>
        <strong className="stat-val rv" style={{ '--i': 1 }}>
          {value}
        </strong>
        <span className="kpi-note rv" style={{ '--i': 2 }}>
          {change !== undefined ? <Delta value={change * 100} dp={1} /> : null}
          {note}
        </span>
      </div>
    </section>
  )
}

const CARDS = {
  investor: [
    { label: `Sales forecast, ${next}`, value: whole(kpi.forecast_sales), change: kpi.forecast_change, note: `vs ${whole(kpi.forecast_last_quarter)} last quarter` },
    { label: `All sales, ${latest}`, value: whole(kpi.sales_latest), change: kpi.sales_change, note: 'vs a year earlier · provisional' },
    { label: `Price per m², ${latest}`, value: `AED ${whole(kpi.price_latest)}`, change: kpi.price_change, note: 'vs a year earlier · flats and villas' },
    { label: 'Segments rising · stable · falling', value: `${kpi.trend_counts.Rising} · ${kpi.trend_counts.Stable} · ${kpi.trend_counts.Declining}`, note: `Of ${kpi.segments_labelled} with enough sales, ${latest}` },
  ],
  buyer: [
    { label: `All sales, ${latest}`, value: whole(kpi.sales_latest), change: kpi.sales_change, note: 'vs a year earlier · provisional' },
    { label: `Off-plan price per m², ${latest}`, value: `AED ${whole(kpi.price_latest_offplan)}`, note: `Ready: AED ${whole(kpi.price_latest_ready)} per m²` },
    { label: `Off-plan share of sales, ${latest}`, value: `${Math.round(kpi.offplan_share * 100)}%`, note: `${whole(kpi.sales_offplan_latest)} off-plan · ${whole(kpi.sales_ready_latest)} ready` },
    { label: 'Areas rising now', value: String(kpi.rising_areas.length), note: kpi.rising_areas.slice(0, 3).join(', ') + (kpi.rising_areas.length > 3 ? ' and more' : '') },
  ],
}

function Head({ title, sub, legend }) {
  return (
    <div className="an-head rv" style={{ '--i': 0 }}>
      <div>
        <h2 className="card-title">{title}</h2>
        <span className="card-sub">{sub}</span>
      </div>
      {legend ? (
        <div className="legend">
          <span>
            <i className="sw" style={{ background: TYPE_COLORS[0] }} /> Off-plan
          </span>
          <span>
            <i className="sw" style={{ background: TYPE_COLORS[1] }} /> Ready
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** One clickable row per area segment; clicking asks Estaro about it. */
function AreaList({ rows, value, ask }) {
  return (
    <div className="rank-list rv" style={{ '--i': 1 }}>
      {rows.map((a, i) => (
        <button key={`${a.area}-${a.registration}`} type="button" className="rank-row" onClick={() => ask(`What is the outlook for ${a.name}?`)}>
          <em>{i + 1}</em>
          <span className="rank-name">
            <strong>{a.name}</strong>
            <small>
              {a.registration}
              {a.trend ? ` · ${a.trend}` : ''}
            </small>
          </span>
          {value(a)}
        </button>
      ))}
    </div>
  )
}

function SalesChart() {
  const rows = kpi.monthly_sales.slice(-12)
  return (
    <section className="card span-3" style={{ '--d': '280ms' }}>
      <Head title="Sales per month" sub={`All property types · ${monthName(rows[0].month)} to ${monthName(rows[rows.length - 1].month)}`} legend />
      <div className="rv" style={{ '--i': 1 }}>
        <LineChart
          labels={rows.map((r) => monthName(r.month))}
          series={[
            { name: 'Off-plan', color: TYPE_COLORS[0], values: rows.map((r) => r.offplan), fill: true },
            { name: 'Ready', color: TYPE_COLORS[1], values: rows.map((r) => r.ready), dashed: true },
          ]}
          height={250}
          format={compact}
        />
      </div>
    </section>
  )
}

function MixCard() {
  const [active, setActive] = useState(null)
  const data = [
    { name: 'Off-plan', v: kpi.sales_offplan_latest },
    { name: 'Ready', v: kpi.sales_ready_latest },
  ]
  return (
    <section className="card span-1" style={{ '--d': '340ms' }}>
      <Head title="Sales mix" sub={latest} />
      <div className="ch-body rv" style={{ '--i': 1 }}>
        <Donut data={data} colors={TYPE_COLORS} active={active} onActive={setActive}>
          <small>{active == null ? 'Total' : data[active].name}</small>
          <strong>{compact(active == null ? kpi.sales_latest : data[active].v)}</strong>
        </Donut>
        <div className="ch-list">
          {data.map((d, i) => (
            <button key={d.name} type="button" className={`ch-row ${active === i ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <i className="sw" style={{ background: TYPE_COLORS[i] }} />
              <span>{d.name}</span>
              <em>{Math.round((100 * d.v) / kpi.sales_latest)}%</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function ForecastLeaders({ ask }) {
  return (
    <section className="card span-2" style={{ '--d': '400ms' }}>
      <Head title="Biggest forecasts" sub={`Most sales expected, ${next}`} />
      <AreaList
        rows={areasFile.rows.slice(0, 6)}
        ask={ask}
        value={(a) => (
          <span className="rank-val">
            <b>{whole(a.forecast_sales)}</b>
            {a.sales_change != null ? <Delta value={a.sales_change * 100} dp={0} /> : null}
          </span>
        )}
      />
    </section>
  )
}

function RisingAreas({ ask }) {
  const rows = areasFile.rows.filter((a) => a.trend === 'Rising').slice(0, 6)
  return (
    <section className="card span-2" style={{ '--d': '460ms' }}>
      <Head title="Rising areas" sub="Up over the last year · forecast vs last quarter" />
      <AreaList
        rows={rows}
        ask={ask}
        value={(a) => (
          <span className="rank-val">
            <b>{whole(a.forecast_sales)}</b>
            {a.sales_change != null ? <Delta value={a.sales_change * 100} dp={0} /> : null}
          </span>
        )}
      />
    </section>
  )
}

function PriceChart() {
  const rows = kpi.price_quarters
  return (
    <section className="card span-3" style={{ '--d': '280ms' }}>
      <Head title="Price per m² by quarter" sub={`Flats and villas, AED · ${shortQuarter(rows[0].quarter)} to ${shortQuarter(rows[rows.length - 1].quarter)}`} legend />
      <div className="rv" style={{ '--i': 1 }}>
        <LineChart
          labels={rows.map((r) => shortQuarter(r.quarter))}
          series={[
            { name: 'Off-plan', color: TYPE_COLORS[0], values: rows.map((r) => r.offplan), fill: true },
            { name: 'Ready', color: TYPE_COLORS[1], values: rows.map((r) => r.ready), dashed: true },
          ]}
          height={250}
          format={(v) => `AED ${compact(v)}`}
        />
      </div>
    </section>
  )
}

const when = (slot) =>
  new Date(slot).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function NextViewing({ ask, go }) {
  const [viewings, setViewings] = useState(null)
  useEffect(() => {
    const load = () =>
      fetch('/api/viewings')
        .then((r) => r.json())
        .then((d) => setViewings(d.viewings))
        .catch(() => setViewings([]))
    load()
    window.addEventListener('viewings-changed', load)
    return () => window.removeEventListener('viewings-changed', load)
  }, [])
  const upcoming = (viewings ?? []).filter((v) => new Date(v.slot) > new Date()).sort((a, b) => a.slot.localeCompare(b.slot))
  const first = upcoming[0]
  return (
    <section className="card span-1 next-card" style={{ '--d': '340ms' }}>
      <Head title="Next viewing" sub={upcoming.length ? `${upcoming.length} booked` : 'Nothing booked yet'} />
      <div className="rv next-body" style={{ '--i': 1 }}>
        <span className="next-ic">
          <Icon name="calendar" size={22} />
        </span>
        {first ? (
          <>
            <strong>{first.title}</strong>
            <span className="muted">{when(first.slot)}</span>
            <button type="button" className="btn sm ghost" onClick={() => go('viewings')}>
              See all viewings
            </button>
          </>
        ) : (
          <>
            <span className="muted">Estaro can find a home and book a viewing for you.</span>
            <button type="button" className="btn sm sage" onClick={() => ask(STARTERS.buyer[0].text)}>
              <Icon name="sparkle" size={14} /> Book one for me
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function BestValue({ ask }) {
  const rows = areasFile.rows
    .filter((a) => a.price_m2_last && a.trend !== 'Declining')
    .sort((a, b) => a.price_m2_last - b.price_m2_last)
    .slice(0, 6)
  return (
    <section className="card span-2" style={{ '--d': '400ms' }}>
      <Head title="Lowest price per m²" sub={`Areas not falling, ${latest}`} />
      <AreaList rows={rows} ask={ask} value={(a) => <span className="rank-val"><b>AED {whole(a.price_m2_last)}</b></span>} />
    </section>
  )
}

function AskCard({ ask }) {
  return (
    <section className="card span-2" style={{ '--d': '460ms' }}>
      <Head title="Ask Estaro" sub="It searches, matches and books on its own" />
      <div className="ask-list rv" style={{ '--i': 1 }}>
        {STARTERS.buyer.map((s) => (
          <button key={s.text} type="button" className="ask-row" onClick={() => ask(s.text)}>
            <span>
              <Icon name={s.icon} size={17} />
            </span>
            {s.text}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { mode, admin, ask, go } = useApp()
  const [shown, setShown] = useState(mode)
  const leaving = shown !== mode

  useEffect(() => {
    if (!leaving) return undefined
    const t = window.setTimeout(() => setShown(mode), LEAVE_MS)
    return () => window.clearTimeout(t)
  }, [leaving, mode])

  return (
    <>
      <div className={`dash ${leaving ? 'leaving' : ''}`} key={shown}>
        {CARDS[shown].map((card, i) => (
          <KpiCard key={card.label} d={`${i * 70}ms`} {...card} />
        ))}
        {shown === 'investor' ? (
          <>
            <SalesChart />
            <MixCard />
            <ForecastLeaders ask={ask} />
            <RisingAreas ask={ask} />
          </>
        ) : (
          <>
            <PriceChart />
            <NextViewing ask={ask} go={go} />
            <BestValue ask={ask} />
            <AskCard ask={ask} />
          </>
        )}
      </div>
      <p className="dash-data">
        Viewing as {admin.name} · Data to {kpi.data_to} · Forecast for {next} covers {kpi.forecast_segments} area segments
      </p>
    </>
  )
}
