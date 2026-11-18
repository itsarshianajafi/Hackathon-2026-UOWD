import { useEffect, useRef } from 'react'

/* ------------------------------------------------------------------
   Estaro's orb is alive: it blinks, glances around, follows the pointer,
   dozes off when nobody is around and reacts to answers with a mood.
   Everything writes straight to the DOM (data-mood, data-sleep,
   .blink/.startle and the --gx/--gy gaze variables) so a blink never
   re-renders React.
   ------------------------------------------------------------------ */

const SLEEP_AFTER = 45000
const FOLLOW_FOR = 2600

/** Moods that play once, then relax back to idle. */
const REACTIONS = new Set(['happy', 'excited', 'concerned', 'confused', 'wink'])

/** Where the eyes look for each mood (-1…1 on both axes). */
const LOOK = {
  talking: [0, 0.1],
  listening: [-0.1, 0.85],
  happy: [0, -0.05],
  excited: [0, -0.1],
  concerned: [-0.3, 0.65],
  confused: [0.5, -0.6],
  wink: [0.15, -0.1],
}
const PONDER = [
  [-0.5, -0.8],
  [0.55, -0.75],
]
const GLANCES = [
  [-0.55, -0.12],
  [0, 0],
  [0.5, -0.2],
  [-0.3, 0.35],
  [0.35, 0.3],
  [0, -0.45],
]

const orbs = new Set()
let pointer = null
let lastActive = 0
let raf = 0

const calm = () => document.documentElement.dataset.motion === 'reduced' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

const wake = () => {
  lastActive = performance.now()
  orbs.forEach((o) => o.wake())
}
const frame = () => {
  raf = 0
  orbs.forEach((o) => o.track())
}
const onMove = (e) => {
  pointer = { x: e.clientX, y: e.clientY, t: performance.now() }
  wake()
  if (!raf) raf = requestAnimationFrame(frame)
}

const join = (o) => {
  if (!orbs.size) {
    lastActive = performance.now()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    window.addEventListener('keydown', wake)
  }
  orbs.add(o)
}
const leave = (o) => {
  orbs.delete(o)
  if (orbs.size) return
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerdown', wake)
  window.removeEventListener('keydown', wake)
}

/**
 * Bring an orb element to life. `mood` is idle | thinking | talking |
 * listening, or a reaction (happy, excited, concerned, confused, wink)
 * that plays for `hold` ms. A reaction replays only when `cue` changes.
 */
export function useOrbLife(ref, mood = 'idle', { cue, hold = 3800 } = {}) {
  const life = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const timers = new Set()
    const later = (fn, ms) => {
      const t = window.setTimeout(() => {
        timers.delete(t)
        fn()
      }, ms)
      timers.add(t)
      return t
    }
    const cancel = (t) => {
      window.clearTimeout(t)
      timers.delete(t)
    }
    const s = { mood: 'idle', asleep: false, played: null, relax: 0, dart: 0 }

    const gaze = (x, y) => {
      el.style.setProperty('--gx', x.toFixed(3))
      el.style.setProperty('--gy', y.toFixed(3))
      el.style.setProperty('--fx', (1 - Math.abs(x) * 0.22).toFixed(3))
    }

    const blink = (twice) => {
      el.classList.add('blink')
      later(() => {
        el.classList.remove('blink')
        if (twice) later(() => blink(false), 150)
      }, 120)
    }

    const ponder = (i) => {
      gaze(...PONDER[i % 2])
      s.dart = later(() => ponder(i + 1), 700)
    }

    const setMood = (next, key) => {
      // a reaction counts as played once it has run its full hold, so one cut
      // short (say, by Estaro starting to speak) plays again afterwards
      const tag = `${next}:${key}`
      const m = REACTIONS.has(next) && tag === s.played ? 'idle' : next
      cancel(s.relax)
      cancel(s.dart)
      if (m !== 'idle' && s.asleep) {
        s.asleep = false
        delete el.dataset.sleep
      }
      s.mood = m
      el.dataset.mood = m
      if (m === 'thinking') ponder(0)
      else if (LOOK[m]) gaze(...LOOK[m])
      if (REACTIONS.has(m)) {
        s.relax = later(() => {
          s.played = tag
          setMood('idle')
        }, hold)
      }
    }

    const o = {
      wake() {
        if (!s.asleep) return
        s.asleep = false
        delete el.dataset.sleep
        el.classList.add('startle')
        later(() => el.classList.remove('startle'), 650)
        later(() => blink(true), 260)
      },
      track() {
        if (!pointer || s.mood !== 'idle' || s.asleep || calm()) return
        const r = el.getBoundingClientRect()
        if (!r.width) return
        const reach = 160 + r.width * 2
        let x = (pointer.x - (r.left + r.width / 2)) / reach
        let y = (pointer.y - (r.top + r.height / 2)) / reach
        const m = Math.hypot(x, y)
        if (m > 1) {
          x /= m
          y /= m
        }
        gaze(x, y)
      },
    }

    const blinkLoop = () =>
      later(() => {
        if (!s.asleep && !document.hidden && !calm()) blink(Math.random() < 0.22)
        blinkLoop()
      }, 2200 + Math.random() * 3800)

    const idleLoop = () =>
      later(() => {
        if (s.mood === 'idle' && !s.asleep && !calm()) {
          if (performance.now() - lastActive > SLEEP_AFTER) {
            s.asleep = true
            el.dataset.sleep = ''
            gaze(0, 0.3)
          } else if (!pointer || performance.now() - pointer.t > FOLLOW_FOR) {
            gaze(...GLANCES[Math.floor(Math.random() * GLANCES.length)])
          }
        }
        idleLoop()
      }, 1600 + Math.random() * 2600)

    el.style.setProperty('--float-delay', `${(-Math.random() * 4).toFixed(2)}s`)
    life.current = { setMood }
    join(o)
    blinkLoop()
    idleLoop()
    return () => {
      leave(o)
      timers.forEach((t) => window.clearTimeout(t))
      life.current = null
    }
  }, [ref, hold])

  useEffect(() => {
    life.current?.setMood(mood, cue)
  }, [mood, cue])
}
