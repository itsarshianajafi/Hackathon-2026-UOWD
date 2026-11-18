import { useEffect, useId, useRef, useState } from 'react'
import { resample } from '../lib/metrics'

/* Catmull-Rom → cubic Bézier, the soft curve every line in the app uses. */
const smooth = (pts, t = 0.18) => {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) * t
    const c1y = p1[1] + (p2[1] - p0[1]) * t
    const c2x = p2[0] - (p3[0] - p1[0]) * t
    const c2y = p2[1] - (p3[1] - p1[1]) * t
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}

/** Tweens an array of numbers to a new array (any length) — the chart morph. */
function useTween(values, duration = 900) {
  const [shown, setShown] = useState(values)
  const cur = useRef(values)
  const key = values.join(',')
  useEffect(() => {
    const from = resample(cur.current, values.length)
    const to = values
    let raf = 0
    let start = 0
    const ease = (x) => 1 - Math.pow(1 - x, 4)
    const step = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / duration)
      const next = to.map((v, i) => from[i] + (v - from[i]) * ease(t))
      cur.current = next
      setShown(next)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration])
  return shown
}

/* ---------------- Sparkline (stat cards) ---------------- */
export function Sparkline({ values, width = 90, height = 34, color = 'var(--sage)', strokeWidth = 2, area = false, stretch = false, className = '' }) {
  const id = useId()
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = 3
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2),
  ])
  const d = smooth(pts, 0.2)
  return (
    <svg
      className={`spark ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      aria-hidden="true"
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="spark-area" d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${id})`} />
        </>
      ) : null}
      <path
        className="spark-line"
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength="1"
        vectorEffect={stretch ? 'non-scaling-stroke' : undefined}
      />
    </svg>
  )
}

/* ---------------- Chunky mini bars (Spent this month) ---------------- */
export function MiniBars({ values, labels, format }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...values)
  return (
    <div className="mini-bars" onMouseLeave={() => setHover(null)}>
      {values.map((v, i) => (
        <span
          key={i}
          className={`mb ${i % 3 === 1 ? 'light' : ''} ${hover === i ? 'hot' : ''}`}
          style={{ '--h': `${Math.max(18, (v / max) * 100)}%`, '--i': i }}
          onMouseEnter={() => setHover(i)}
        >
          {hover === i ? (
            <em className="mb-tip">
              {labels?.[i]} · {format ? format(v) : v}
            </em>
          ) : null}
        </span>
      ))}
    </div>
  )
}

/* ---------------- Balance wave (morphs between periods) ---------------- */
export function WaveChart({ values, labels, height = 200, format = (v) => v, topRoom = 0.95 }) {
  const id = useId()
  const shown = useTween(values)
  const [hover, setHover] = useState(null)
  const W = 1000
  const H = height
  const min = Math.min(...shown)
  const max = Math.max(...shown)
  const range = max - min || 1
  const lo = min - range * 0.18
  const hi = max + range * topRoom
  const n = shown.length
  const x = (i) => (i / (n - 1)) * W
  const y = (v) => (1 - (v - lo) / (hi - lo)) * H
  const pts = shown.map((v, i) => [x(i), y(v)])
  const d = smooth(pts)
  const ready = shown.length === values.length

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (values.length - 1))
    setHover(Math.max(0, Math.min(values.length - 1, i)))
  }

  return (
    <div className="wave" style={{ height: H }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sage)" stopOpacity=".16" />
            <stop offset=".75" stopColor="var(--sage)" stopOpacity=".03" />
            <stop offset="1" stopColor="var(--sage)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--sage-2)" />
            <stop offset=".5" stopColor="var(--sage)" />
            <stop offset="1" stopColor="var(--sage-deep)" />
          </linearGradient>
        </defs>
        <path className="wave-area" d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id}-fill)`} />
        <path
          className="wave-line"
          d={d}
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="2.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength="1"
        />
      </svg>
      {hover != null && ready ? (
        <>
          <i className="wave-cursor" style={{ left: `${(hover / (n - 1)) * 100}%` }} />
          <i className="wave-dot" style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(y(shown[hover]) / H) * 100}%` }} />
          <div
            className={`chart-tip ${hover > n * 0.62 ? 'left' : ''}`}
            style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(y(shown[hover]) / H) * 100}%` }}
          >
            <b>{labels?.[hover]}</b>
            <strong>{format(values[hover])}</strong>
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ---------------- Semicircle gauge (Earnings) ---------------- */
export function Gauge({ value, size = 210, stroke = 34 }) {
  const id = useId()
  const p = Math.max(0, Math.min(100, value)) / 100
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const L = Math.PI * r
  const h = size / 2 + 6
  return (
    <svg className="gauge" width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true" style={{ '--L': L }}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--sage-2)" />
          <stop offset="1" stopColor="var(--sage-deep)" />
        </linearGradient>
      </defs>
      <path d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`} fill="none" stroke="var(--sage-soft)" strokeWidth={stroke} />
      <path
        className="gauge-arc"
        d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeDasharray={`${L} ${L * 2}`}
        strokeDashoffset={L * (1 - p)}
      />
      <g className="gauge-tip" style={{ transform: `rotate(${p * 180}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <line x1={stroke / 2 - stroke / 2 - 4} y1={cy} x2={stroke + 6} y2={cy} stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/* ---------------- Vertical bars (analytics + assistant answers) ---------------- */
export function BarChart({ items, format = (v) => v, height = 150, hot = null, compact = false }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...items.map((d) => d.v)) || 1
  const active = hover ?? hot
  return (
    <div className={`barchart ${compact ? 'compact' : ''}`} onMouseLeave={() => setHover(null)}>
      <div className="bc-plot" style={{ height }}>
        {items.map((d, i) => (
          <div key={`${d.label}-${i}`} className={`bc-col ${active === i ? 'hot' : ''} ${active != null && active !== i ? 'dim' : ''}`} onMouseEnter={() => setHover(i)} style={{ '--i': i }}>
            {hover === i ? <em className="bc-tip">{format(d.v)}</em> : null}
            <span className="bc-bar" style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="bc-labels">
        {items.map((d, i) => (
          <span key={`${d.label}-${i}`} className={active === i ? 'hot' : ''}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Multi-series line (analytics) ---------------- */
export function LineChart({ labels, series, height = 260, format = (v) => v }) {
  const [hover, setHover] = useState(null)
  const id = useId()
  const W = 1000
  const H = height
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.12
  const n = labels.length
  const x = (i) => (i / (n - 1)) * W
  const y = (v) => 10 + (1 - v / max) * (H - 18)
  const lines = series.map((s) => {
    const d = smooth(s.values.map((v, i) => [x(i), y(v)]))
    return { ...s, d, area: `${d} L ${W} ${H} L 0 ${H} Z` }
  })
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const ticks = [1, 0.75, 0.5, 0.25, 0]
  return (
    <div className="line-chart">
      <div className="lc-axis">
        {ticks.map((f) => (
          <span key={f} style={{ top: `${(y((max / 1.12) * f) / H) * 100}%` }}>
            {format((max / 1.12) * f)}
          </span>
        ))}
      </div>
      <div className="lc-plot" style={{ height: H }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {ticks.map((f) => (
          <i key={f} className="lc-grid" style={{ top: `${(y((max / 1.12) * f) / H) * 100}%` }} />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true">
          <defs>
            {lines.map((l, i) => (
              <linearGradient key={l.name} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={l.color} stopOpacity=".2" />
                <stop offset="1" stopColor={l.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {lines.map((l, i) => (l.fill ? <path key={`a-${l.name}`} className="lc-area" d={l.area} fill={`url(#${id}-${i})`} /> : null))}
          {lines.map((l, i) => (
            <path
              key={l.name}
              className="lc-line"
              d={l.d}
              pathLength="1"
              fill="none"
              stroke={l.color}
              strokeWidth="2.6"
              strokeDasharray={l.dashed ? '0.008 0.012' : undefined}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              style={{ '--i': i }}
            />
          ))}
        </svg>
        {hover != null ? (
          <>
            <i className="wave-cursor" style={{ left: `${(hover / (n - 1)) * 100}%` }} />
            {lines.map((l) => (
              <i key={l.name} className="wave-dot" style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(y(l.values[hover]) / H) * 100}%`, '--c': l.color }} />
            ))}
            <div
              className={`chart-tip ${hover > n * 0.6 ? 'left' : ''}`}
              style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(Math.min(...lines.map((l) => y(l.values[hover]))) / H) * 100}%` }}
            >
              <b>{labels[hover]}</b>
              {lines.map((l) => (
                <span key={l.name}>
                  <i className="sw" style={{ background: l.color }} />
                  {l.name}
                  <strong>{format(l.values[hover])}</strong>
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="lc-labels">
        {labels.map((lb, i) => (
          <span key={`${lb}-${i}`} className={hover === i ? 'hot' : ''}>
            {lb}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Donut ---------------- */
export function Donut({ data, colors, size = 190, stroke = 26, active, onActive, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.v, 0)
  const gap = 5
  const segs = data.map((d, i) => ({
    ...d,
    i,
    len: (d.v / total) * c,
    before: data.slice(0, i).reduce((sum, x) => sum + (x.v / total) * c, 0),
  }))
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={stroke} />
        {segs.map((s) => (
          <circle
            key={s.name}
            className={`donut-seg ${active != null && active !== s.i ? 'dim' : ''} ${active === s.i ? 'hot' : ''}`}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors[s.i % colors.length]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, s.len - gap - stroke * 0.6)} ${c}`}
            strokeDashoffset={-s.before - stroke * 0.3}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--i': s.i, '--c': c }}
            onMouseEnter={() => onActive?.(s.i)}
            onMouseLeave={() => onActive?.(null)}
          />
        ))}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  )
}

/* ---------------- Progress ring ---------------- */
export function Ring({ value, size = 64, stroke = 7, color = 'var(--sage)', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft-2)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ '--c': c }}
        />
      </svg>
      <div className="ring-body">{children}</div>
    </div>
  )
}
