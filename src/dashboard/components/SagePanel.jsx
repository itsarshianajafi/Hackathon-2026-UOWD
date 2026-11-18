import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Orb } from './Brand'
import { BarChart, Sparkline } from './Charts'
import { CountUp, Delta, Persona } from './ui'
import { useApp } from '../lib/store'
import { money, num } from '../lib/format'
import { stopSpeaking } from '../lib/voice'

import { STARTERS } from '../lib/nav'
import AgentCards from './AgentCards'

const STEP_LABEL = {
  search_listings: 'Searched listings',
  match_buyer: 'Matched listings to the brief',
  get_area_outlook: 'Checked the area outlook',
  top_areas: 'Ranked areas by forecast',
  get_available_slots: 'Checked free slots',
  book_viewing: 'Booked a viewing',
  list_viewings: 'Read booked viewings',
}

const THINKING = ['Reading the brief', 'Searching listings', 'Checking the market data', 'Almost there']

const fmtBy = (fmt) => (fmt === 'num' ? (v) => num(v) : fmt === 'pct' ? (v) => `${v.toFixed(0)}%` : (v) => money(v, v >= 1000 ? 0 : 2))

/** **bold** → <strong>, newlines → paragraphs. */
function Rich({ text }) {
  return text.split('\n\n').map((para, p) => (
    <p key={p}>
      {para.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </p>
  ))
}

function Block({ b, i }) {
  const f = fmtBy(b.fmt)
  if (b.type === 'stat')
    return (
      <div className="ab ab-stat" style={{ '--i': i }}>
        <span>{b.label}</span>
        <div>
          <strong>
            <CountUp value={b.value} format={f} duration={1100} />
          </strong>
          {b.delta != null ? <Delta value={b.delta} invert={b.invert} dp={1} /> : null}
        </div>
      </div>
    )
  if (b.type === 'stats')
    return (
      <div className="ab ab-stats" style={{ '--i': i, '--n': b.items.length }}>
        {b.items.map((it, k) => (
          <div key={it.label} className={it.hot ? 'hot' : ''} style={{ '--k': k }}>
            <span>{it.label}</span>
            <strong>
              <CountUp value={it.value} format={fmtBy(it.fmt)} duration={1100} delay={k * 90} />
            </strong>
          </div>
        ))}
      </div>
    )
  if (b.type === 'bars')
    return (
      <div className="ab ab-bars" style={{ '--i': i }}>
        <BarChart items={b.items} format={f} height={b.wide ? 110 : 96} hot={b.hot ?? null} compact />
      </div>
    )
  if (b.type === 'spark')
    return (
      <div className="ab ab-spark" style={{ '--i': i }}>
        <span>{b.label}</span>
        <Sparkline values={b.values} width={340} height={56} area stretch strokeWidth={2.2} className="wide" />
      </div>
    )
  if (b.type === 'progress')
    return (
      <div className="ab ab-progress" style={{ '--i': i }}>
        <div>
          <span>{b.label}</span>
          <strong>{b.value.toFixed(0)}%</strong>
        </div>
        <i>
          <b style={{ width: `${b.value}%` }} />
        </i>
      </div>
    )
  if (b.type === 'list')
    return (
      <div className="ab ab-list" style={{ '--i': i }}>
        {b.items.map((it, k) => (
          <div key={`${it.title}-${k}`} className="ab-row" style={{ '--k': k }}>
            {it.hue != null ? <Persona name={it.title} hue={it.hue} size={30} /> : <span className={`ab-dot ${it.tone ?? ''}`} />}
            <span className="ab-row-txt">
              <strong>{it.title}</strong>
              <small>{it.sub}</small>
            </span>
            <em className={it.tone ?? ''}>{it.value}</em>
          </div>
        ))}
      </div>
    )
  return null
}

function Message({ m, onTyped, onSpot, onAsk, last }) {
  const { reduceMotion } = useApp()
  const [shown, setShown] = useState(m.status === 'typing' && !reduceMotion ? 0 : m.text.length)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (m.status !== 'thinking') return undefined
    const t = window.setInterval(() => setStep((s) => (s + 1) % THINKING.length), 700)
    return () => window.clearInterval(t)
  }, [m.status])

  useEffect(() => {
    if (m.status !== 'typing') return undefined
    if (reduceMotion) {
      onTyped(m.id)
      return undefined
    }
    let n = 0
    let raf = 0
    let prev = 0
    const total = m.text.length
    const tick = (now) => {
      if (now - prev > 16) {
        prev = now
        n = Math.min(total, n + Math.max(2, Math.round(total / 90)))
        setShown(n)
      }
      if (n < total) raf = requestAnimationFrame(tick)
      else onTyped(m.id)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [m.status, m.text, m.id, onTyped, reduceMotion])

  if (m.role === 'user')
    return (
      <div className="msg user">
        <div className="bubble">{m.text}</div>
      </div>
    )

  const typing = m.status === 'typing' && shown < m.text.length
  const text = m.status === 'typing' ? m.text.slice(0, shown) : m.text
  const done = m.status === 'done' || (m.status === 'typing' && !typing)

  return (
    <div className={`msg ai ${m.status}`}>
      <Orb size={28} mood={m.status === 'thinking' ? 'thinking' : m.status === 'streaming' || typing ? 'talking' : (m.mood ?? 'idle')} />
      <div className="msg-col">
        {m.status === 'thinking' ? (
          <div className="thinking">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            <span className="thinking-txt" key={step}>
              {THINKING[step]}…
            </span>
          </div>
        ) : (
          <div className="bubble">
            <Rich text={text} />
            {typing || m.status === 'streaming' ? <i className="caret" /> : null}
          </div>
        )}
        {done && m.steps?.length ? <AgentCards steps={m.steps} onAsk={onAsk} /> : null}
        {done && m.steps?.length ? (
          <ol className="agent-steps">
            {m.steps.map((s, i) => (
              <li key={i} className={s.tool === 'book_viewing' && !s.output?.ok ? 'failed' : ''}>
                {STEP_LABEL[s.tool] ?? s.tool}
              </li>
            ))}
          </ol>
        ) : null}
        {done && m.blocks?.length ? (
          <div className="blocks">
            {m.blocks.map((b, i) => (
              <Block key={i} b={b} i={i} />
            ))}
          </div>
        ) : null}
        {done ? (
          <div className="msg-meta">
            <span className="engine">
              <Icon name="sparkle" size={12} stroke={2} />
              {m.steps?.length ? `Estaro agent · ${m.steps.length} action${m.steps.length > 1 ? 's' : ''}` : 'Estaro agent'}
            </span>
            {m.note ? <span className="note">{m.note}</span> : null}
            {m.spot && last ? (
              <button type="button" className="show-me" onClick={() => onSpot(m.spot)}>
                <Icon name="scan" size={13} stroke={2} />
                Show on dashboard
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function SagePanel({ open, onClose, messages, busy, onAsk, onClear, onTyped }) {
  const { admin, ai, setAi, go, view, spotlight, speaking, mode } = useApp()
  const [q, setQ] = useState('')
  const body = useRef(null)
  const input = useRef(null)
  const stick = useRef(true)

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 350)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const key = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-veil')) onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])

  // keep the newest message in view while it types, unless the reader scrolled up
  useLayoutEffect(() => {
    const el = body.current
    if (!el || !stick.current) return undefined
    const follow = () => {
      el.scrollTop = el.scrollHeight
    }
    follow()
    const mo = new MutationObserver(follow)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [messages])

  const send = (text) => {
    const t = (text ?? q).trim()
    if (!t || busy) return
    stick.current = true
    onAsk(t)
    setQ('')
  }

  const lastAi = [...messages].reverse().find((m) => m.role === 'ai')
  const chips = lastAi?.status === 'done' && lastAi.suggest?.length ? lastAi.suggest : messages.length ? STARTERS[mode].slice(0, 3).map((s) => s.text) : []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  // the header face follows the conversation: think, talk, react, or watch you type
  const headMood =
    lastAi?.status === 'thinking'
      ? 'thinking'
      : (lastAi && lastAi.status !== 'done') || speaking
        ? 'talking'
        : q.trim()
          ? 'listening'
          : (lastAi?.mood ?? 'idle')

  const showSpot = (id) => {
    if (view !== 'dashboard') {
      go('dashboard')
      window.setTimeout(() => spotlight(id), 700)
    } else spotlight(id)
  }

  return (
    <aside className={`sage-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Estaro AI assistant" inert={!open}>
      <div className="sage-aura" aria-hidden="true" />
      <header className="sage-head">
        <Orb size={44} mood={headMood} cue={lastAi?.id} />
        <div className="sage-id">
          <strong>Estaro AI</strong>
          <small>
            <i className="on-dot" />
            AI agent · DLD market data
          </small>
        </div>
        <button
          type="button"
          className={`icon-btn ${ai.speak ? 'lit' : ''}`}
          onClick={() => {
            if (ai.speak) stopSpeaking()
            setAi((a) => ({ ...a, speak: !a.speak }))
          }}
          aria-label={ai.speak ? 'Mute spoken answers' : 'Speak answers aloud'}
          title={ai.speak ? 'Voice on' : 'Voice off'}
        >
          <Icon name={ai.speak ? 'volume' : 'volumeOff'} size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={onClear} disabled={!messages.length} aria-label="Clear chat" title="Clear chat">
          <Icon name="refresh" size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Estaro">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div
        className="sage-body"
        ref={body}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {messages.length === 0 ? (
          <div className="sage-hello">
            <div className="hello-orb">
              <Orb size={84} mood={q.trim() ? 'listening' : 'idle'} />
            </div>
            <h3>
              Hi {admin.first}, I’m <span>Estaro</span>
            </h3>
            <p>I search listings, match them to your brief, check each area’s outlook and book viewings. Market figures come from DLD sales data.</p>
            <div className="starters">
              {STARTERS[mode].map((s, i) => (
                <button key={s.text} type="button" className="starter" style={{ '--i': i }} onClick={() => send(s.text)}>
                  <span>
                    <Icon name={s.icon} size={17} />
                  </span>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} m={m} onTyped={onTyped} onSpot={showSpot} onAsk={send} last={m === lastAi} />)
        )}
      </div>

      <footer className="sage-foot">
        {chips.length && !busy ? (
          <div className="chips-row">
            {chips.map((c, i) => (
              <button key={c} type="button" className="chip" style={{ '--i': i }} onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="sage-input"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <textarea
            ref={input}
            rows={1}
            value={q}
            placeholder="Ask for homes, an area outlook or a viewing…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
              if (e.key === 'ArrowUp' && !q && lastUser) {
                e.preventDefault()
                setQ(lastUser.text)
              }
            }}
          />
          <button type="submit" className="send" disabled={!q.trim() || busy} aria-label="Send">
            <Icon name="arrowUp" size={18} stroke={2.2} />
          </button>
        </form>
        <small className="sage-note">
          <Icon name="lock" size={12} stroke={2} /> Listings are demo data. Market figures are DLD sales records.
        </small>
      </footer>
    </aside>
  )
}
