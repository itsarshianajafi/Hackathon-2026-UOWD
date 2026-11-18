import { useState } from 'react'
import Icon from '../components/Icon'
import { Empty, PageHead } from '../components/ui'
import { useApp } from '../lib/store'
import { addDays, clock, DAYS, MONTHS, sameDay, startOfDay, uid } from '../lib/format'

const KIND = {
  viewing: { icon: 'home', label: 'Viewing' },
  meeting: { icon: 'users', label: 'Meeting' },
  maintenance: { icon: 'bolt', label: 'Maintenance' },
}

export default function Schedule() {
  const { events, setEvents, toast, ask } = useApp()
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const [sel, setSel] = useState(0)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('10:00')
  const [kind, setKind] = useState('meeting')
  const day = days[sel]
  const list = events.filter((e) => sameDay(e.at, day)).sort((a, b) => a.at - b.at)

  const add = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const [h, m] = time.split(':').map(Number)
    const at = new Date(day)
    at.setHours(h, m)
    setEvents((list) => [...list, { id: uid(), at, title: title.trim(), who: 'You', kind }])
    toast('Event added', `${title.trim()} · ${DAYS[day.getDay()]} ${clock(at)}`, { icon: 'calendar' })
    setTitle('')
  }

  return (
    <div className="sc-grid">
      <section className="card sc-week" style={{ '--d': '0ms' }}>
        <PageHead title={`${MONTHS[today.getMonth()]} ${today.getFullYear()}`} sub="Pick a day to see what’s on">
          <button type="button" className="btn ghost" onClick={() => ask('What meetings do I have today?')}>
            <Icon name="sparkle" size={15} /> What’s on today?
          </button>
        </PageHead>
        <div className="week-strip">
          {days.map((d, i) => {
            const n = events.filter((e) => sameDay(e.at, d)).length
            return (
              <button key={d.toISOString()} type="button" className={`wd rv ${sel === i ? 'on' : ''}`} style={{ '--i': i + 2 }} onClick={() => setSel(i)}>
                <small>{i === 0 ? 'Today' : DAYS[d.getDay()]}</small>
                <strong>{d.getDate()}</strong>
                <span className="wd-dots">
                  {Array.from({ length: Math.min(3, n) }, (_, k) => (
                    <i key={k} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="agenda" key={sel}>
          {list.length === 0 ? (
            <Empty icon="calendar" title="A free day" body="Nothing booked yet. Add something below." />
          ) : (
            list.map((e, i) => (
              <div key={e.id} className={`ag-row ${e.kind}`} style={{ '--i': i }}>
                <span className="ag-time">{clock(e.at)}</span>
                <i className="ag-line" />
                <span className="ag-ic">
                  <Icon name={KIND[e.kind]?.icon ?? 'calendar'} size={17} />
                </span>
                <div className="ag-txt">
                  <strong>{e.title}</strong>
                  <small>
                    {KIND[e.kind]?.label} · {e.who}
                  </small>
                </div>
                <button type="button" className="icon-btn" aria-label="Remove event" onClick={() => setEvents((l) => l.filter((x) => x.id !== e.id))}>
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card sc-add" style={{ '--d': '120ms' }}>
        <h2 className="card-title rv" style={{ '--i': 0 }}>
          Add to {sel === 0 ? 'today' : `${DAYS[day.getDay()]} ${day.getDate()}`}
        </h2>
        <form className="form rv" style={{ '--i': 1 }} onSubmit={add}>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Viewing · Maple Court" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="meeting">Meeting</option>
                <option value="viewing">Viewing</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
          </div>
          <button type="submit" className="btn sage block" disabled={!title.trim()}>
            <Icon name="plus" size={16} stroke={2.2} /> Add event
          </button>
        </form>
        <div className="sc-kinds rv" style={{ '--i': 2 }}>
          {Object.entries(KIND).map(([k, v]) => (
            <div key={k} className={`ag-row mini ${k}`}>
              <span className="ag-ic">
                <Icon name={v.icon} size={15} />
              </span>
              <span>{v.label}</span>
              <em>{events.filter((e) => e.kind === k).length}</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
