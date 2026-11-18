import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { CountUp, Empty, PageHead, Persona, Segmented } from '../components/ui'
import { useApp } from '../lib/store'
import { ago, money, num, shortDate } from '../lib/format'

const TONE = { Active: 'up', Pending: 'amber', Inactive: 'down' }

export default function Clients() {
  const { clients, removeClient, openModal, ask, M, booting } = useApp()
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'joined', dir: -1 })

  const counts = useMemo(() => clients.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {}), [clients])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return clients
      .filter((c) => (filter === 'All' || c.status === filter) && (!s || `${c.name} ${c.email} ${c.property}`.toLowerCase().includes(s)))
      .sort((a, b) => {
        const k = sort.key
        const va = k === 'name' ? a.name : k === 'spent' ? a.spent : a.joined.getTime()
        const vb = k === 'name' ? b.name : k === 'spent' ? b.spent : b.joined.getTime()
        return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
      })
  }, [clients, filter, q, sort])

  const th = (key, label) => (
    <button type="button" className={`th-sort ${sort.key === key ? 'on' : ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}>
      {label}
      <Icon name={sort.key === key && sort.dir === 1 ? 'chevUp' : 'chevDown'} size={13} stroke={2} />
    </button>
  )

  const lead = booting ? 900 : 250

  return (
    <>
      <div className="cl-stats">
        {[
          { label: 'Total users', v: M.totalUsers, icon: 'users' },
          { label: 'Active now', v: M.activeUsers, icon: 'checkCircle' },
          { label: 'Joined this month', v: M.newUsers.month, icon: 'trend' },
          { label: 'Joined today', v: M.newUsers.today, icon: 'sparkle' },
        ].map((s, i) => (
          <section key={s.label} className="card cl-stat" style={{ '--d': `${i * 70}ms` }}>
            <span className="kpi-ic rv" style={{ '--i': 0 }}>
              <Icon name={s.icon} size={19} />
            </span>
            <div className="rv" style={{ '--i': 1 }}>
              <small>{s.label}</small>
              <strong>
                <CountUp value={s.v} format={num} delay={lead + i * 80} />
              </strong>
            </div>
          </section>
        ))}
      </div>

      <section className="card cl-table" style={{ '--d': '220ms' }}>
        <PageHead title="Recent clients" sub={`${clients.length} people signed up in the last two months`}>
          <label className="mini-search">
            <Icon name="search" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" />
          </label>
          <button type="button" className="btn sage" onClick={() => openModal('addClient')}>
            <Icon name="plus" size={16} stroke={2.2} /> Add client
          </button>
        </PageHead>

        <div className="rv" style={{ '--i': 3 }}>
          <Segmented
            items={['All', 'Active', 'Pending', 'Inactive'].map((k) => ({ key: k, label: k, count: k === 'All' ? clients.length : counts[k] ?? 0 }))}
            value={filter}
            onChange={setFilter}
          />
        </div>

        <div className="tbl" role="table">
          <div className="tbl-row tbl-head" role="row">
            {th('name', 'Client')}
            <span>Property</span>
            <span>Plan</span>
            {th('joined', 'Joined')}
            {th('spent', 'Spent')}
            <span>Status</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <Empty icon="users" title="No clients match" body="Try another name or filter." />
          ) : (
            rows.map((c, i) => (
              <div key={c.id} className="tbl-row rv" role="row" style={{ '--i': Math.min(i, 12) + 4 }}>
                <span className="tbl-who">
                  <Persona name={c.name} hue={c.hue} size={36} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.email}</small>
                  </span>
                </span>
                <span className="muted">{c.property}</span>
                <span>
                  <span className={`plan ${c.plan.toLowerCase()}`}>{c.plan}</span>
                </span>
                <span className="muted" title={shortDate(c.joined)}>
                  {ago(c.joined)}
                </span>
                <span className="mono">{money(c.spent)}</span>
                <span>
                  <span className={`pill-tag ${TONE[c.status]}`}>
                    <i />
                    {c.status}
                  </span>
                </span>
                <span className="tbl-act">
                  <button type="button" className="icon-btn" onClick={() => ask(`Tell me about ${c.name}`)} aria-label={`Ask Estaro about ${c.name}`} title="Ask Estaro">
                    <Icon name="sparkle" size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => removeClient(c.id)} aria-label={`Remove ${c.name}`} title="Remove">
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  )
}
