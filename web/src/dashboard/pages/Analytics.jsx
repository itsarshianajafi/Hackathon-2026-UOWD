import { useState } from 'react'
import Icon from '../components/Icon'
import { BarChart, Donut, LineChart } from '../components/Charts'
import { CountUp, Delta, PageHead, Segmented } from '../components/ui'
import { useApp } from '../lib/store'
import { compact, money, num } from '../lib/format'

const CH_COLORS = ['var(--sage-deep)', 'var(--sage-2)', 'var(--sand-ink)', 'var(--sage-3)']

function Kpi({ icon, label, value, format, delta, note, d, invert }) {
  const { booting } = useApp()
  return (
    <section className="card kpi" style={{ '--d': `${d}ms` }}>
      <div className="kpi-head rv" style={{ '--i': 0 }}>
        <span className="kpi-ic">
          <Icon name={icon} size={19} />
        </span>
        <span>{label}</span>
      </div>
      <strong className="kpi-val rv" style={{ '--i': 1 }}>
        <CountUp value={value} format={format} delay={(booting ? 900 : 250) + d} />
      </strong>
      <div className="kpi-foot rv" style={{ '--i': 2 }}>
        {delta != null ? <Delta value={delta} invert={invert} dp={1} /> : null}
        <span>{note}</span>
      </div>
    </section>
  )
}

export default function Analytics() {
  const { M, ask } = useApp()
  const [range, setRange] = useState('12m')
  const [ch, setCh] = useState(null)
  // the running month would look like a crash next to full months, so the trend uses completed months
  const full = M.months.filter((m) => !m.partial)
  const months = range === '6m' ? full.slice(-6) : full
  const t = M.T.month

  return (
    <>
      <PageHead title="Performance overview" sub={`Month to date vs the same point last month · ${M.today.toDateString()}`}>
        <Segmented
          items={[
            { key: '6m', label: '6 months' },
            { key: '12m', label: '12 months' },
          ]}
          value={range}
          onChange={setRange}
        />
        <button type="button" className="btn sage" onClick={() => ask('Give me a summary')}>
          <Icon name="sparkle" size={16} /> Explain with Estaro
        </button>
      </PageHead>

      <div className="an-grid">
        <Kpi icon="trend" label="Sales" value={t.rev} format={(n) => money(n)} delta={M.growth.revMonth} note="vs last month" d={0} />
        <Kpi icon="moneybag" label="Profit" value={t.profit} format={(n) => money(n)} delta={M.growth.profitMonth} note={`${t.margin.toFixed(1)}% margin`} d={70} />
        <Kpi icon="receipt" label="Bookings" value={t.orders} format={num} delta={((t.orders - M.T.lastMonthSame.orders) / M.T.lastMonthSame.orders) * 100} note={`${money(t.ticket)} avg ticket`} d={140} />
        <Kpi icon="users" label="New users" value={M.newUsers.month} format={num} delta={M.growth.usersMonth} note={`${num(M.totalUsers)} total`} d={210} />

        <section className="card an-line" style={{ '--d': '200ms' }}>
          <div className="an-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-title">Revenue vs expenses</h2>
              <span className="card-sub">Completed months · {months[0].label} to {months[months.length - 1].label}</span>
            </div>
            <div className="legend">
              <span>
                <i className="sw" style={{ background: 'var(--sage)' }} /> Revenue
              </span>
              <span>
                <i className="sw" style={{ background: 'var(--sand-ink)' }} /> Expenses
              </span>
            </div>
          </div>
          <div className="rv" style={{ '--i': 1 }} key={range}>
            <LineChart
              labels={months.map((m) => m.label)}
              series={[
                { name: 'Revenue', color: 'var(--sage)', values: months.map((m) => m.rev), fill: true },
                { name: 'Expenses', color: 'var(--sand-ink)', values: months.map((m) => m.exp), dashed: true },
              ]}
              height={250}
              format={(v) => compact(v)}
            />
          </div>
        </section>

        <section className="card an-channels" style={{ '--d': '280ms' }}>
          <div className="an-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-title">Sales by channel</h2>
              <span className="card-sub">This month</span>
            </div>
          </div>
          <div className="ch-body rv" style={{ '--i': 1 }}>
            <Donut data={M.channels.map((c) => ({ name: c.name, v: c.rev }))} colors={CH_COLORS} active={ch} onActive={setCh}>
              <small>{ch == null ? 'Total' : M.channels[ch].name}</small>
              <strong>{compact(ch == null ? t.rev : M.channels[ch].rev)}</strong>
            </Donut>
            <div className="ch-list">
              {M.channels.map((c, i) => (
                <button key={c.id} type="button" className={`ch-row ${ch === i ? 'on' : ''}`} onMouseEnter={() => setCh(i)} onMouseLeave={() => setCh(null)} onClick={() => ask(`How many bookings came from ${c.name}?`)}>
                  <i className="sw" style={{ background: CH_COLORS[i] }} />
                  <span>{c.name}</span>
                  <em>{(c.share * 100).toFixed(0)}%</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card an-props" style={{ '--d': '340ms' }}>
          <div className="an-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-title">Revenue by property</h2>
              <span className="card-sub">This month, highest first</span>
            </div>
          </div>
          <div className="rv" style={{ '--i': 1 }}>
            <BarChart items={M.properties.map((p) => ({ label: p.name.split(' ')[0], v: p.rev }))} format={(v) => money(v, 0)} height={190} hot={0} />
          </div>
        </section>

        <section className="card an-dow" style={{ '--d': '400ms' }}>
          <div className="an-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-title">Best days to sell</h2>
              <span className="card-sub">Average daily sales, last 12 weeks</span>
            </div>
            <span className="pill-tag sage">{M.bestDow.day} wins</span>
          </div>
          <div className="rv" style={{ '--i': 1 }}>
            <BarChart items={M.byDow.map((d) => ({ label: d.short, v: d.avg }))} format={(v) => money(v, 0)} height={190} hot={M.byDow.indexOf(M.bestDow)} />
          </div>
        </section>
      </div>
    </>
  )
}
