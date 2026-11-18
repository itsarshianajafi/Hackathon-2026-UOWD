import { useEffect, useRef, useState } from 'react'
import { Orb } from './Brand'

const SIZE = 120
const STEPS = 48

const calm = () => document.documentElement.dataset.motion === 'reduced' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const easeOut = (t) => 1 - (1 - t) ** 3
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k])
}

/**
 * One smooth flight along a cubic curve: many evenly timed keyframes whose
 * positions follow `ease`, so speed changes gradually and never stalls.
 */
const flight = (curve, ease, scale, z, fade) =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const p = ease(i / STEPS)
    const [x, y] = bezier(...curve, p)
    return {
      offset: i / STEPS,
      transform: `translate(${x / z - SIZE / 2}px, ${y / z - SIZE / 2}px) scale(${scale[0] + (scale[1] - scale[0]) * p})`,
      opacity: fade ? Math.min(1, p * 6) : 1,
    }
  })

/**
 * Estaro's entrance on page load: the orb glides in from the top-right corner
 * to the middle of the screen, lands with a bounce, says "I'm Estaro, your
 * dashboard AI" while it floats (a smile, then a wink), and flies down into
 * its Ask Estaro button in the bottom-right corner. `onDone` fires when it
 * lands (or straight away with reduced motion); `skip` ends it early.
 */
export default function SageArrival({ onDone, skip }) {
  const ref = useRef(null)
  const [mood, setMood] = useState('idle')
  const [stage, setStage] = useState('flying')

  useEffect(() => {
    if (skip) onDone()
  }, [skip, onDone])

  useEffect(() => {
    const el = ref.current
    if (!el || calm()) {
      onDone()
      return undefined
    }
    let alive = true
    const anims = []
    const timers = []
    const wait = (ms) => new Promise((r) => timers.push(window.setTimeout(r, ms)))
    // the page is zoomed (base.css), so screen pixels are turned into CSS pixels
    const z = parseFloat(getComputedStyle(document.body).zoom) || 1
    const W = window.innerWidth
    const H = window.innerHeight
    const mid = [W / 2, H / 2]

    const run = async () => {
      // in: a wide arc from beyond the top-right corner, dropping onto the centre
      const into = [[W + 70, -70], [W * 0.68, -H * 0.06], [W * 0.4, H * 0.16], mid]
      anims.push(el.animate(flight(into, easeOut, [0.35, 1], z, true), { duration: 1000, delay: 250, fill: 'forwards' }))
      await anims[0].finished
      if (!alive) return
      setStage('hello')
      await wait(400)
      if (!alive) return
      setMood('happy')
      await wait(450)
      if (!alive) return
      setMood('wink')
      await wait(350)
      if (!alive) return
      setStage('leaving')
      setMood('idle')
      await wait(150)
      if (!alive) return
      // out: up and over to the right, then down into the button
      const dock = document.querySelector('.sage-fab .orb')?.getBoundingClientRect()
      const end = dock ? [dock.left + dock.width / 2, dock.top + dock.height / 2] : [W - 45, H - 52]
      const land = (dock ? dock.width / z : 34) / SIZE
      const out = [mid, [W * 0.56, H * 0.24], [W * 0.98, H * 0.42], end]
      anims.push(el.animate(flight(out, easeInOut, [1, land], z, false), { duration: 900, fill: 'forwards' }))
      await anims[1].finished
      if (alive) onDone()
    }
    run().catch(() => {})
    return () => {
      alive = false
      timers.forEach((t) => window.clearTimeout(t))
      anims.forEach((a) => a.cancel())
    }
  }, [onDone])

  return (
    <div className={`sage-arrival ${stage}`} ref={ref} style={{ '--size': `${SIZE}px` }} aria-hidden="true">
      <div className="sage-arrival-body">
        <div className="sage-arrival-says">
          I’m <b>Estaro</b>, your dashboard AI
        </div>
        <Orb size={SIZE} mood={mood} hold={60000} />
      </div>
    </div>
  )
}
