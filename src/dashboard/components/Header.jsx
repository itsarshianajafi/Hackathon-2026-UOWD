import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Logo, Orb } from './Brand'
import { Persona } from './ui'
import ModeToggle from './ModeToggle'

const PIN_TOP = 24
import { useApp } from '../lib/store'
import { STARTERS, navFor } from '../lib/nav'

/** Header search: type anything — jump to a page, a client, a property, or ask Estaro. */
function Search() {
  const { ask, go, mode } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState(0)
  const input = useRef(null)
  const wrap = useRef(null)

  useEffect(() => {
    const key = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName ?? '')
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const down = (e) => !wrap.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = []
    if (s) out.push({ kind: 'ask', icon: 'sparkle', title: `Ask Estaro: “${q.trim()}”`, sub: 'Estaro searches, matches and books for you' })
    const pages = navFor(mode).filter((v) => !s || v.label.toLowerCase().includes(s)).slice(0, s ? 3 : 4)
    pages.forEach((p) => out.push({ kind: 'page', icon: p.icon, title: p.label, sub: 'Page', id: p.id }))
    if (!s) STARTERS[mode].slice(0, 2).forEach((t) => out.push({ kind: 'ask', icon: 'sparkle', title: t.text, sub: 'Try asking Estaro', text: t.text }))
    return out
  }, [q, mode])

  const pick = useCallback(
    (r) => {
      setOpen(false)
      if (r.kind === 'ask') ask(r.text ?? q)
      else if (r.kind === 'client') go('clients')
      else go(r.id)
      setQ('')
      input.current?.blur()
    },
    [ask, go, q],
  )

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHot((h) => Math.min(results.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHot((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[hot]) pick(results[hot])
    } else if (e.key === 'Escape') {
      setOpen(false)
      input.current?.blur()
    }
  }

  return (
    <div className={`search ${open ? 'open' : ''}`} ref={wrap}>
      <input
        ref={input}
        value={q}
        placeholder="Search or ask Estaro…"
        onChange={(e) => {
          setQ(e.target.value)
          setHot(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        aria-label="Search or ask Estaro"
      />
      <kbd className="search-kbd">⌘K</kbd>
      <button
        type="button"
        className="search-go"
        aria-label="Search"
        onClick={() => {
          if (q.trim()) ask(q)
          else input.current?.focus()
          setQ('')
        }}
      >
        <Icon name="search" size={20} stroke={2} />
      </button>
      {open ? (
        <div className="search-pop" role="listbox">
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.title}`}
              type="button"
              role="option"
              aria-selected={hot === i}
              className={`sr ${hot === i ? 'on' : ''} ${r.kind}`}
              style={{ '--i': i }}
              onMouseEnter={() => setHot(i)}
              onClick={() => pick(r)}
            >
              {r.kind === 'client' ? (
                <Persona name={r.title} hue={r.client.hue} size={34} />
              ) : r.kind === 'ask' ? (
                <span className="sr-ic ask">
                  <Orb size={22} />
                </span>
              ) : (
                <span className="sr-ic">
                  <Icon name={r.icon} size={17} />
                </span>
              )}
              <span className="sr-txt">
                <strong>{r.title}</strong>
                <small>{r.sub}</small>
              </span>
              <Icon name="arrowRight" size={15} className="sr-go" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function Header({ title, sub }) {
  const { go, view } = useApp()
  const slot = useRef(null)
  const [pinLeft, setPinLeft] = useState(null)

  // once the header scrolls away, the logo stays put above the rail, like the rail itself
  useEffect(() => {
    const place = () => {
      const r = slot.current?.getBoundingClientRect()
      const rail = document.querySelector('.rail')?.getBoundingClientRect()
      const pinned = !!r && !!rail && r.top < PIN_TOP
      setPinLeft(pinned ? { left: rail.left, width: rail.width } : null)
      document.documentElement.classList.toggle('logo-pinned', pinned)
    }
    place()
    window.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      document.documentElement.classList.remove('logo-pinned')
    }
  }, [])
  const words = title.split(' ')

  return (
    <header className="hdr">
      <div className="hdr-logo-slot" ref={slot}>
        <button
          type="button"
          className={`hdr-logo ${pinLeft != null ? 'pinned' : ''}`}
          style={pinLeft ?? undefined}
          onClick={() => go('dashboard')}
          aria-label="Dashboard"
        >
          <Logo />
        </button>
      </div>

      <div className="hdr-greet" key={view}>
        <h1 aria-label={title}>
          {words.map((w, i) => (
            <span key={`${w}-${i}`} className="word" style={{ '--i': i }} aria-hidden="true">
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h1>
        <p className="hdr-sub" style={{ '--i': words.length }}>
          {sub}
        </p>
      </div>

      <div className="hdr-tools">
        <Search />

        <ModeToggle />

      </div>
    </header>
  )
}
