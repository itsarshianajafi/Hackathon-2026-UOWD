import { useMemo, useState } from 'react'
import areasFile from '@/data/areas.json'
import { Segmented } from '../components/ui'
import { useApp } from '../lib/store'

const QUARTER = { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' }
const quarterName = (code) => `${QUARTER[code.slice(4)]} ${code.slice(0, 4)}`
const whole = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))
const pct = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%`)
const TONE = { Rising: 'up', Stable: 'sage', Declining: 'down' }
const COLS = { gridTemplateColumns: 'minmax(220px, 2fr) 100px 120px 110px 130px 110px', minWidth: 820 }
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
            {rows.length} area segments · DLD sales to {areasFile.data_to} · flats and villas
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
            <span>{a.trend ? <span className={`pill-tag ${TONE[a.trend]}`}>{a.trend}</span> : <span className="muted">—</span>}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
