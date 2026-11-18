import { useLayoutEffect, useRef } from 'react'
import Icon from './Icon'
import { Logo } from './Brand'
import { useApp } from '../lib/store'
import { navFor } from '../lib/nav'

const centre = (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** Slides the dark highlight onto whichever button is current. */
function useIndicator(view) {
  const group = useRef(null)
  const ind = useRef(null)
  useLayoutEffect(() => {
    const place = () => {
      const btn = group.current?.querySelector(`[data-rail="${view}"]`)
      const el = ind.current
      if (!el) return
      if (!btn) {
        el.style.opacity = '0'
        el.style.scale = '0.4'
        return
      }
      el.style.opacity = '1'
      el.style.scale = '1'
      el.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(group.current)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [view])
  return [group, ind]
}

export default function Rail() {
  const { view, go, theme, switchTheme, mode } = useApp()
  const [group, ind] = useIndicator(view)

  return (
    <aside className="rail" aria-label="Sections" ref={group}>
      <span className="rail-ind" ref={ind} />
      <button type="button" className="rail-logo" aria-label="Dashboard" tabIndex={-1} onClick={() => go('dashboard')}>
        <Logo size={52} />
      </button>
      <nav className="rail-top">
        {navFor(mode).map((r, i) => (
          <button
            key={r.id}
            type="button"
            data-rail={r.id}
            data-tip={r.label}
            className={`rail-btn ${view === r.id ? 'on' : ''}`}
            style={{ '--i': i }}
            aria-label={r.label}
            aria-current={view === r.id ? 'page' : undefined}
            onClick={() => go(r.id)}
          >
            <Icon name={r.icon} size={23} />
          </button>
        ))}
      </nav>

      <div className="rail-foot">
        <button
          type="button"
          className="rail-btn theme-btn"
          data-tip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ '--i': 7 }}
          onClick={(e) => switchTheme(theme === 'dark' ? 'light' : 'dark', centre(e.currentTarget))}
        >
          <span className={`theme-swap ${theme}`}>
            <Icon name="sun" size={23} className="sun-ic" />
            <Icon name="moon" size={21} className="moon-ic" />
          </span>
        </button>
      </div>
    </aside>
  )
}
