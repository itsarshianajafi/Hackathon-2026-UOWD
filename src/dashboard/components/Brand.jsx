import { useId, useRef } from 'react'
import { useOrbLife } from '../lib/orbLife'

/** The Estaro mark: a script E under a roof line. */
export function Logo({ size = 58 }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/brand/estaro-mark.png" alt="" className="logo-ink" />
      <img src="/brand/estaro-mark-white.png" alt="" className="logo-white" />
    </span>
  )
}

/** Illustrated admin avatar — a memoji-style face with gold shades. */
export function Avatar({ size = 88 }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden="true" className="avatar-svg">
      <defs>
        <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe48a" />
          <stop offset="1" stopColor="#f0a92b" />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6cfa8" />
          <stop offset="1" stopColor="#e9ac7f" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="44" cy="44" r="44" />
        </clipPath>
      </defs>
      <circle cx="44" cy="44" r="44" fill="#f1e6d4" />
      <g clipPath={`url(#${id}-clip)`}>
        <path d="M14 92c2-15 14-22 30-22s28 7 30 22Z" fill="#3c4f43" />
        <path d="M37 60h14v11c-2.3 2.2-4.6 3.2-7 3.2s-4.7-1-7-3.2V60Z" fill="#dc9e72" />
        <ellipse cx="25.5" cy="45" rx="3.6" ry="5" fill="#e5a679" />
        <ellipse cx="62.5" cy="45" rx="3.6" ry="5" fill="#e5a679" />
        <ellipse cx="44" cy="43" rx="18.5" ry="21" fill={`url(#${id}-skin)`} />
        <path
          d="M25.5 41c-2-13.5 5.5-23 18.8-23 13 0 20.4 8.6 18.4 22.4-1.8-5.6-5-9-9.8-10.4-5.6 2-14.2 1.6-19-1.2-3.4 2.4-6.4 6.6-8.4 12.2Z"
          fill="#3b2a20"
        />
        <path d="M30 24c3-6 10-9 17-8 6 1 10 4 12 8-6-3-13-4-19-2-4 1-7 2-10 2Z" fill="#4a3528" />
        <path d="M27.5 50c1.4 9 7.6 15.6 16.5 15.6S59.1 59 60.5 50c-2 4.6-5 6.6-8.4 6.8-2.4-2.2-5.2-3-8.1-3s-5.7.8-8.1 3c-3.4-.2-6.4-2.2-8.4-6.8Z" fill="#3b2a20" opacity=".9" />
        <path d="M38.6 56.4c3.6 2.4 7.2 2.4 10.8 0" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <g className="avatar-shades">
          <path d="M23.5 40.5h41" stroke="#c98b1c" strokeWidth="2" strokeLinecap="round" />
          <path d="M26 39.5h14.5c1 0 1.6.9 1.4 1.9l-1.3 5.4c-.6 2.4-2.7 4-5.2 4h-2.6c-3.4 0-6.2-2.6-6.6-6l-.4-3.3c-.1-1 .5-2 1.5-2Z" fill={`url(#${id}-lens)`} stroke="#c98b1c" strokeWidth="1.4" />
          <path d="M62 39.5H47.5c-1 0-1.6.9-1.4 1.9l1.3 5.4c.6 2.4 2.7 4 5.2 4h2.6c3.4 0 6.2-2.6 6.6-6l.4-3.3c.1-1-.5-2-1.5-2Z" fill={`url(#${id}-lens)`} stroke="#c98b1c" strokeWidth="1.4" />
          <path className="shades-glint" d="M29 42.5 33 41M50 42.5l4-1.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
        </g>
      </g>
    </svg>
  )
}

/**
 * Estaro — a glass ball with two pill eyes. On its own it blinks, glances
 * around, follows the pointer and dozes off; `mood` makes it think, talk,
 * listen or react to an answer (see lib/orbLife.js).
 */
export function Orb({ size = 40, busy = false, mood, cue, hold }) {
  const ref = useRef(null)
  useOrbLife(ref, mood ?? (busy ? 'thinking' : 'idle'), { cue, hold })
  return (
    <span ref={ref} className="orb" style={{ width: size, height: size, '--s': `${size}px` }} aria-hidden="true">
      <span className="orb-ball">
        <i className="orb-swirl" />
        <svg className="orb-face" viewBox="0 0 100 100">
          <g className="orb-eyes">
            {[37, 63].map((x, i) => (
              <g key={x} transform={`translate(${x} 47)`}>
                <g className={`orb-eye ${i ? 'r' : 'l'}`}>
                  <g className="orb-lid">
                    <rect className="orb-pill" x="-4.1" y="-10" width="8.2" height="20" rx="4.1" />
                    <path className="orb-arc" d="M-6.2 2.8Q0-4.8 6.2 2.8" />
                  </g>
                </g>
              </g>
            ))}
          </g>
        </svg>
        <i className="orb-rim" />
        <i className="orb-shine" />
      </span>
      {size >= 40 ? <i className="orb-z">z</i> : null}
    </span>
  )
}

/** Fingerprint drawn as concentric open arcs, so it can be "scanned" stroke by stroke. */
export function Fingerprint({ size = 74, progress = null }) {
  const arcs = [
    'M24 52c-1.6-3.4-2.4-7.2-2.4-11.2C21.6 28.4 31.6 18.6 44 18.6s22.4 9.8 22.4 22.2c0 4-.8 7.8-2.4 11.2',
    'M30 58c-2.6-4.4-4-9.6-4-15C26 32.6 34 24.8 44 24.8S62 32.6 62 43c0 6.6-1.8 12.4-5 17.4',
    'M36.4 62.6c-2.6-5.2-4-11.2-4-17.6 0-6.4 5.2-11.6 11.6-11.6S55.6 38.6 55.6 45c0 7.8-1.6 14-4.6 19.4',
    'M43.2 66c-3-6.2-4.6-13-4.6-20.2 0-3 2.4-5.4 5.4-5.4s5.4 2.4 5.4 5.4c0 8.8-1.2 15.8-4 21.4',
    'M44 46c0 7.6-.8 13.6-2.6 19.2',
    'M17.6 36.4C20.8 24 31.4 12.4 44 12.4s23.2 9 26.4 21.4',
    'M23 15.6C28.6 10.6 35.8 7.6 44 7.6s15.4 3 21 8',
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 88 76" className="fingerprint" aria-hidden="true">
      {arcs.map((d, i) => (
        <path key={i} d={d} pathLength="1" className="fp-base" style={{ '--i': i }} />
      ))}
      {progress != null
        ? arcs.map((d, i) => (
            <path key={`p-${i}`} d={d} pathLength="1" className="fp-fill" style={{ strokeDashoffset: Math.max(0, 1 - Math.max(0, progress * arcs.length - i)) }} />
          ))
        : null}
    </svg>
  )
}
