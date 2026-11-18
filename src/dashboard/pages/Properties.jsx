import Icon from '../components/Icon'
import { Ring } from '../components/Charts'
import { CountUp } from '../components/ui'
import { useApp } from '../lib/store'
import { money } from '../lib/format'

/** A little skyline per property: lit windows show how full it is. */
function Building({ p }) {
  const floors = Math.min(6, Math.max(3, Math.round(p.units / 5)))
  const cols = 4
  const lit = Math.round((p.occupied / p.units) * floors * cols)
  return (
    <div className="pr-art" style={{ '--h': p.hue }}>
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

export default function Properties() {
  const { M, ask, booting } = useApp()
  const total = M.properties.reduce((s, p) => s + p.units, 0)
  const occ = M.properties.reduce((s, p) => s + p.occupied, 0)
  return (
    <>
      <div className="pr-summary">
        {[
          { label: 'Properties', v: M.properties.length, f: (n) => Math.round(n), icon: 'building' },
          { label: 'Units booked', v: occ, f: (n) => `${Math.round(n)} / ${total}`, icon: 'checkCircle' },
          { label: 'Occupancy', v: M.occupancy, f: (n) => `${n.toFixed(0)}%`, icon: 'trend' },
          { label: 'Revenue this month', v: M.T.month.rev, f: (n) => money(n, 0), icon: 'moneybag' },
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

      <div className="pr-grid">
        {M.properties.map((p, i) => (
          <section key={p.id} className="card pr-card" style={{ '--d': `${160 + i * 60}ms` }}>
            <Building p={p} />
            <div className="pr-body">
              <div className="pr-top rv" style={{ '--i': 0 }}>
                <div>
                  <h3>{p.name}</h3>
                  <small>
                    <Icon name="pin" size={13} /> {p.city}
                  </small>
                </div>
                <Ring value={p.occupancy / 100} size={54} stroke={6}>
                  <b className="ring-pct">{p.occupancy.toFixed(0)}%</b>
                </Ring>
              </div>
              <div className="pr-stats rv" style={{ '--i': 1 }}>
                <div>
                  <small>This month</small>
                  <strong>{money(p.rev, 0)}</strong>
                </div>
                <div>
                  <small>Units</small>
                  <strong>
                    {p.occupied}/{p.units}
                  </strong>
                </div>
                <div>
                  <small>Rating</small>
                  <strong>
                    <Icon name="star" size={13} stroke={2} className="star" /> {p.rating}
                  </strong>
                </div>
              </div>
              <button type="button" className="btn sm ghost block rv" style={{ '--i': 2 }} onClick={() => ask(`How is ${p.name} doing?`)}>
                <Icon name="sparkle" size={14} /> Ask Estaro about it
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
