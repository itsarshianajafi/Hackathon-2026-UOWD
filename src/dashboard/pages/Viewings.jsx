import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'

const when = (slot) =>
  new Date(slot).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const COLS = { gridTemplateColumns: '80px minmax(240px, 2fr) minmax(160px, 1fr) 200px', minWidth: 680 }

export default function Viewings() {
  const { ask } = useApp()
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

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Viewings booked by Estaro</h2>
          <span className="card-sub">Dubai time · kept until the server restarts</span>
        </div>
        <button type="button" className="btn sage" onClick={() => ask('Find me a 2-bed under AED 2,000,000 and book the best match')}>
          Ask Estaro to book one
        </button>
      </div>
      {viewings === null ? (
        <p className="muted">Loading…</p>
      ) : viewings.length === 0 ? (
        <p className="muted empty-note">No viewings yet. Ask Estaro to find a home and book a viewing.</p>
      ) : (
        <div className="tbl" role="table">
          <div className="tbl-row tbl-head" role="row" style={COLS}>
            <span>Ref</span>
            <span>Home</span>
            <span>For</span>
            <span>When</span>
          </div>
          {viewings.map((v, i) => (
            <div key={v.id} className="tbl-row rv" role="row" style={{ ...COLS, '--i': i }}>
              <span className="mono">{v.id}</span>
              <strong>{v.title}</strong>
              <span className="muted">{v.buyer}</span>
              <span>{when(v.slot)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
