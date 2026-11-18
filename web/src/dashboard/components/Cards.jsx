import { useMemo, useRef, useState } from 'react'
import Icon from './Icon'

function MasterMark({ size = 30 }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 36 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="#eb3b2f" />
      <circle cx="25" cy="11" r="10" fill="#f7a823" fillOpacity=".95" />
      <path d="M18 3.9a10 10 0 0 1 0 14.2 10 10 0 0 1 0-14.2Z" fill="#fb6a1d" />
    </svg>
  )
}

export function CreditCard({ c }) {
  return (
    <div className={`cc-face ${c.skin}`}>
      <span className="cc-brand">{c.brand}</span>
      <span className="cc-holder">{c.holder}</span>
      <span className="cc-num">{c.number}</span>
      <span className="cc-exp">{c.exp}</span>
      <Icon name="contactless" size={20} stroke={1.8} className="cc-nfc" />
      <span className="cc-mc">
        <MasterMark />
      </span>
      <i className="cc-sheen" />
    </div>
  )
}

export function CardStack({ cards, big = false }) {
  const [pref, setPref] = useState(() => cards.map((c) => c.id))
  const [fly, setFly] = useState(null)
  const wrap = useRef(null)
  // newly added cards jump to the front; the rest keep the order the user chose
  const order = useMemo(() => {
    const known = pref.filter((id) => cards.some((c) => c.id === id))
    const fresh = cards.map((c) => c.id).filter((id) => !pref.includes(id))
    return [...fresh, ...known]
  }, [pref, cards])

  const tilt = (e) => {
    const r = wrap.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    wrap.current.style.setProperty('--tx', `${y * -10}deg`)
    wrap.current.style.setProperty('--tz', `${x * 10}deg`)
  }
  const reset = () => {
    wrap.current.style.setProperty('--tx', '0deg')
    wrap.current.style.setProperty('--tz', '0deg')
  }
  const bring = (id) => {
    if (order[0] === id) return
    setFly(id)
    window.setTimeout(() => setPref([id, ...order.filter((x) => x !== id)]), 260)
    window.setTimeout(() => setFly(null), 800)
  }

  return (
    <div className={`cc-scene ${big ? 'big' : ''}`} ref={wrap} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="cc-stack">
        {order.map((id, i) => {
          const c = cards.find((x) => x.id === id)
          if (!c) return null
          return (
            <button
              key={id}
              type="button"
              className={`cc ${fly === id ? 'fly' : ''}`}
              style={{ '--z': order.length - 1 - i, '--k': i }}
              onClick={() => bring(id)}
              aria-label={`${c.holder}'s card ending ${c.number.slice(-4)}${i === 0 ? ', in front' : ', bring to front'}`}
            >
              <CreditCard c={c} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
