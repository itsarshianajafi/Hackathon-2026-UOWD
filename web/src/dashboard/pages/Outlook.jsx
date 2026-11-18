import { useMemo, useState } from 'react'
import areasFile from '@/data/areas.json'
import { Segmented } from '../components/ui'
import { useApp } from '../lib/store'

const QUARTER = { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' }
const quarterName = (code) => `${QUARTER[code.slice(4)]} ${code.slice(0, 4)}`
const whole = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))
const pct = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%`)
const pct1 = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`)
const TONE = { Rising: 'up', Stable: 'sage', Declining: 'down' }
const COLS = { gridTemplateColumns: 'minmax(200px, 2fr) 84px 104px 96px 120px 104px 96px 110px 96px', minWidth: 1100 }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Off-Plan', label: 'Off-plan' },
  { key: 'Ready', label: 'Ready' },
  { key: 'Rising', label: 'Rising only' },
]

export default function Outlook() {
  const { ask } = useApp()
  const [filter, setFilter] = useState('all')
  const rows = useMemo(
    () =>
      areasFile.rows.filter((a) =>
        filter === 'all' ? true : filter === 'Rising' ? a.trend === 'Rising' : a.registration === filter,
      ),
    [filter],
  )
  const next = quarterName(areasFile.forecast_quarter)

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Forecast by area, {next}</h2>
          <span className="card-sub">
            {rows.length} area segments · DLD sales to {areasFile.data_to} · yield from Ejari rents for flats, {areasFile.rent_window.join(' to ')}
          </span>
        </div>
        <Segmented items={FILTERS} value={filter} onChange={setFilter} />
      </div>
      <div className="tbl" role="table">
        <div className="tbl-row tbl-head" role="row" style={COLS}>
          <span>Area</span>
          <span>Type</span>
          <span>Forecast sales</span>
          <span>vs last quarter</span>
          <span>Price per m² (AED)</span>
          <span>Price forecast</span>
          <span>Gross yield</span>
          <span>New homes, 12 mo</span>
          <span>Direction</span>
        </div>
        {rows.map((a, i) => (
          <div
            key={`${a.area}-${a.registration}`}
            className="tbl-row rv"
            role="row"
            style={{ ...COLS, '--i': Math.min(i, 12) }}
            onClick={() => ask(`What is the outlook for ${a.name}?`)}
            title={`Ask Estaro about ${a.name}`}
          >
            <span>
              <strong>{a.name}</strong>
              {a.name !== a.area ? <small className="muted"> · {a.area}</small> : null}
            </span>
            <span className="muted">{a.registration}</span>
            <span className="mono">{whole(a.forecast_sales)}</span>
            <span className={`mono ${a.sales_change == null ? '' : a.sales_change >= 0 ? 'up-txt' : 'down-txt'}`}>{pct(a.sales_change)}</span>
            <span className="mono">{whole(a.price_m2_last)}</span>
            <span className={`mono ${a.price_change == null ? '' : a.price_change >= 0 ? 'up-txt' : 'down-txt'}`}>{pct1(a.price_change)}</span>
            <span className="mono">{a.gross_yield_apartment == null ? '—' : `${(a.gross_yield_apartment * 100).toFixed(1)}%`}</span>
            <span className="mono">{whole(a.pipeline_homes_next_12m)}</span>
            <span>{a.trend ? <span className={`pill-tag ${TONE[a.trend]}`}>{a.trend}</span> : <span className="muted">—</span>}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
