import { useEffect, useLayoutEffect, useRef } from 'react'
import Icon from './Icon'
import { initials } from '../lib/format'

/* ---------------- CountUp ----------------
   Writes straight into the DOM on every frame so a counting number never
   re-renders the page. Re-targets smoothly when `value` changes. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), duration = 1400, delay = 0, className }) {
  const ref = useRef(null)
  const shown = useRef(null)
  const fmt = useRef(format)

  useLayoutEffect(() => {
    fmt.current = format
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const from = shown.current ?? 0
    const to = value
    let raf = 0
    let start = 0
    const ease = (t) => 1 - Math.pow(1 - t, 4)
    const tick = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start - delay) / duration)
      if (t < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      const v = from + (to - from) * ease(t)
      shown.current = v
      el.textContent = fmt.current(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    el.textContent = fmt.current(from)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, delay])

  return <span ref={ref} className={className} />
}

/* ---------------- Delta chip ---------------- */
export function Delta({ value, invert = false, dp = 2 }) {
  const good = invert ? value <= 0 : value >= 0
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {value >= 0 ? '+' : '−'}
      {Math.abs(value).toFixed(dp)}%
    </span>
  )
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    >
      <i />
    </button>
  )
}

/* ---------------- Segmented control with a sliding thumb ---------------- */
export function Segmented({ items, value, onChange, className = '' }) {
  const wrap = useRef(null)
  const thumb = useRef(null)

  useLayoutEffect(() => {
    const place = () => {
      const btn = wrap.current?.querySelector(`[data-key="${CSS.escape(String(value))}"]`)
      if (!btn || !thumb.current) return
      thumb.current.style.width = `${btn.offsetWidth}px`
      thumb.current.style.transform = `translateX(${btn.offsetLeft}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [value, items])

  return (
    <div className={`seg ${className}`} ref={wrap} role="tablist">
      <span className="seg-thumb" ref={thumb} />
      {items.map((it) => {
        const key = typeof it === 'string' ? it : it.key
        const label = typeof it === 'string' ? it : it.label
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={value === key}
            data-key={key}
            className={value === key ? 'on' : ''}
            onClick={() => onChange(key)}
          >
            {label}
            {typeof it === 'object' && it.count != null ? <em>{it.count}</em> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Popover ---------------- */
export function Popover({ open, onClose, anchor = 'right', className = '', children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => {
      if (ref.current && !ref.current.parentElement.contains(e.target)) onClose()
    }
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} className={`pop ${anchor} ${className}`} role="menu">
      {children}
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, sub, width = 440, children, footer }) {
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="icon-btn soft" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

/* ---------------- Page header (word-by-word reveal) ---------------- */
export function PageHead({ title, sub, children }) {
  const words = title.split(' ')
  return (
    <header className="page-head">
      <div>
        <h1 aria-label={title}>
          {words.map((w, i) => (
            <span key={`${w}-${i}`} className="word" style={{ '--i': i }} aria-hidden="true">
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h1>
        {sub ? (
          <p className="rv" style={{ '--i': words.length }}>
            {sub}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="page-actions rv" style={{ '--i': words.length + 1 }}>
          {children}
        </div>
      ) : null}
    </header>
  )
}

/** Initials avatar for clients. */
export function Persona({ name, hue = 140, size = 38 }) {
  return (
    <span
      className="persona"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hue} 42% 68%), hsl(${hue + 24} 34% 46%))`,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function Empty({ icon = 'search', title, body }) {
  return (
    <div className="empty">
      <span>
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
    </div>
  )
}

export function Toasts({ items, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-icon">
            <Icon name={t.icon ?? 'check'} size={16} stroke={2.2} />
          </span>
          <div>
            <strong>{t.title}</strong>
            {t.body ? <p>{t.body}</p> : null}
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
