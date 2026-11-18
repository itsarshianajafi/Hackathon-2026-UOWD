import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import Header from './components/Header'
import Rail from './components/Rail'
import SagePanel from './components/SagePanel'
import SageArrival from './components/SageArrival'
import { AddCardModal, AddClientModal, LogoutModal, TransferModal } from './components/Modals'
import { Toasts } from './components/ui'
import { Logo, Orb } from './components/Brand'

import Dashboard from './pages/Dashboard'
import Outlook from './pages/Outlook'
import Listings from './pages/Listings'
import Viewings from './pages/Viewings'

import { AppContext } from './lib/store'
import { NAV } from './lib/nav'
import { liquidSwitch } from './lib/themeTransition'
import { onSpeaking, speakText, stopSpeaking } from './lib/voice'
import { buildMetrics } from './lib/metrics'
import { money, uid } from './lib/format'
import * as seed from './data/seed'

const PAGES = { dashboard: Dashboard, outlook: Outlook, listings: Listings, viewings: Viewings }

const SEED_CLIENTS = 40

/** One page. Marks itself "settled" once its entrance has played, so content added later animates in quickly. */
function Main({ page: Page, booting }) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), booting ? 3000 : 1700)
    return () => window.clearTimeout(t)
  }, [booting])
  return (
    <main className={`main ${settled ? 'settled' : ''}`} style={{ '--base': booting ? '520ms' : '0ms' }}>
      <Page />
    </main>
  )
}

const viewFromHash = () => {
  const id = window.location.hash.replace('#/', '').replace('#', '')
  return NAV.some((v) => v.id === id) ? id : 'dashboard'
}

const stored = (key, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}
const store = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode — preferences just will not persist */
  }
}

const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms))

export default function App() {
  /* ---------- appearance ---------- */
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('sage-theme') || 'light'
    } catch {
      return 'light'
    }
  })
  const [reduceMotion, setReduceMotion] = useState(() => stored('sage-motion', false))
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('sage-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
    store('sage-motion', reduceMotion)
  }, [reduceMotion])

  const switchTheme = useCallback(
    (next, origin) => {
      if (next === theme) return
      const x = origin?.x ?? window.innerWidth - 60
      const y = origin?.y ?? 60
      liquidSwitch(x, y, () => {
        document.documentElement.dataset.theme = next
        flushSync(() => setTheme(next))
      })
    },
    [theme],
  )

  /* ---------- Estaro settings (voice) ---------- */
  // only today's settings are read back, so older saves (a `voice` flag that was off by default,
  // engine and voice-service fields, keys) are dropped from the browser on the next save
  const [ai, setAi] = useState(() => {
    const { speak, voiceName } = stored('sage-ai', {})
    return { speak: speak ?? true, ...(voiceName ? { voiceName } : {}) }
  })
  useEffect(() => store('sage-ai', ai), [ai])
  const [target, setTarget] = useState(() => stored('sage-target', seed.DEFAULT_TARGET))
  useEffect(() => store('sage-target', target), [target])

  /* ---------- intro choreography ---------- */
  const [bootKey, setBootKey] = useState(0)
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 3200)
    return () => window.clearTimeout(t)
  }, [bootKey])

  /* ---------- routing ---------- */
  const [view, setView] = useState(viewFromHash)
  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = useCallback((id) => {
    setView(id)
    if (window.location.hash !== `#/${id}`) window.history.pushState(null, '', `#/${id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /* ---------- data ---------- */
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).get('mode') === 'buyer' ? 'buyer' : 'investor'))
  const admin = seed.PERSONAS[mode]
  const [daily, setDaily] = useState(() => seed.makeDaily())
  const [clients, setClients] = useState(() => seed.makeClients())
  const [transfers, setTransfers] = useState(() => seed.makeTransfers())
  const [cards, setCards] = useState(seed.CARDS)
  const [events, setEvents] = useState(() => seed.makeEvents())
  const [notifications, setNotifications] = useState(() => seed.makeNotifications())
  const [live, setLive] = useState(null)
  const [liveOn, setLiveOn] = useState(true)

  const M = useMemo(
    () => buildMetrics(daily, clients, { target, clientDelta: clients.length - SEED_CLIENTS }),
    [daily, clients, target],
  )

  /* ---------- toasts ---------- */
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (title, body, opts = {}) => {
      const id = uid()
      setToasts((t) => [...t.slice(-2), { id, title, body, ...opts }])
      window.setTimeout(() => dismiss(id), opts.ms ?? 3600)
    },
    [dismiss],
  )

  /* ---------- live bookings: the dashboard breathes ---------- */
  useEffect(() => {
    if (!liveOn) return undefined
    let t = 0
    const names = seed.LIVE_GUESTS
    const props = seed.PROPERTIES
    const tick = () => {
      t = window.setTimeout(() => {
        if (!document.hidden) {
          const amount = Math.round((38 + Math.random() * 130) * 100) / 100
          const cost = Math.round(amount * (0.5 + Math.random() * 0.1) * 100) / 100
          const prop = props[Math.floor(Math.random() * props.length)]
          const who = names[Math.floor(Math.random() * names.length)]
          setDaily((rows) => {
            const last = rows[rows.length - 1]
            return [
              ...rows.slice(0, -1),
              {
                ...last,
                rev: last.rev + amount,
                exp: last.exp + cost,
                orders: last.orders + 1,
                visitors: last.visitors + 20 + Math.floor(Math.random() * 20),
                balance: last.balance + amount - cost,
              },
            ]
          })
          setLive({ id: uid(), amount, profit: amount - cost, who, prop: prop.name })
          if (Math.random() < 0.55) {
            setTransfers((list) => [
              { id: uid(), who, dir: 'in', amount, note: `Booking · ${prop.name}`, at: new Date(), fresh: true },
              ...list.slice(0, 29),
            ])
          }
          setNotifications((n) => [
            { id: uid(), icon: 'arrowDown', tone: 'green', title: `New booking +${money(amount)}`, body: `${who} · ${prop.name}`, at: new Date(), unread: true },
            ...n.slice(0, 19),
          ])
        }
        tick()
      }, 9000 + Math.random() * 7000)
    }
    tick()
    return () => window.clearTimeout(t)
  }, [liveOn])

  /* ---------- spotlight: the assistant points at a card ---------- */
  const [spot, setSpot] = useState(null)
  const spotTimer = useRef(0)
  const spotlight = useCallback((id) => {
    window.clearTimeout(spotTimer.current)
    setSpot(id)
    window.setTimeout(() => {
      document.querySelector(`[data-spot="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    spotTimer.current = window.setTimeout(() => setSpot(null), 3200)
  }, [])

  /* ---------- modals ---------- */
  const [modal, setModal] = useState(null)
  const openModal = useCallback((type, payload = {}) => setModal({ type, payload }), [])
  const closeModal = useCallback(() => setModal(null), [])
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    if (!NAV.find((n) => n.id === view)?.modes.includes(mode)) go('dashboard')
  }, [mode, view, go])

  /* ---------- Estaro chat ---------- */
  const [aiOpen, setAiOpen] = useState(false)
  // Estaro flies in once per page load before its button appears
  const [arrived, setArrived] = useState(false)
  const arrive = useCallback(() => setArrived(true), [])
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [sageDot, setSageDot] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    onSpeaking(setSpeaking)
    return () => onSpeaking(() => {})
  }, [])
  const memory = useRef({})
  const latest = useRef({})
  useLayoutEffect(() => {
    latest.current = { M, daily, clients, transfers, events, admin, mode, view, ai, messages }
  })

  const patch = useCallback(
    (id, p) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m))),
    [],
  )
  const markTyped = useCallback((id) => patch(id, { status: 'done' }), [patch])

  const speak = useCallback(
    (ans) => {
      const cur = latest.current
      if (!cur.ai.speak) return
      // interrupted by the next answer, or blocked before the first click: stay quiet
      speakText(ans.text, cur.ai.voiceName)
    },
    [],
  )

  const ask = useCallback(
    async (raw) => {
      const q = raw.trim()
      if (!q) return
      setAiOpen(true)
      setSageDot(false)
      stopSpeaking()
      const ctx = latest.current
      const history = ctx.messages
        .filter((m) => m.text && m.status !== 'thinking')
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      const id = uid()
      setMessages((m) => [...m, { id: uid(), role: 'user', text: q }, { id, role: 'ai', status: 'thinking', text: '', blocks: [] }])
      setBusy(true)

      let ans
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...history, { role: 'user', content: q }], mode: ctx.mode, name: ctx.admin.name }),
        })
        const data = await res.json()
        ans = res.ok ? { text: data.text || 'Done.', steps: data.steps ?? [] } : { text: `I could not answer that: ${data.error}`, steps: [], failed: true }
      } catch {
        ans = { text: 'I could not reach the server. Check that it is running.', steps: [], failed: true }
      }
      if (ans.steps.some((s) => s.tool === 'book_viewing' && s.output?.ok)) window.dispatchEvent(new Event('viewings-changed'))
      patch(id, { status: 'typing', text: ans.text, blocks: [], steps: ans.steps, mood: ans.failed ? 'worried' : 'happy' })
      speak(ans)
      setBusy(false)
    },
    [patch, speak],
  )

  const clearChat = useCallback(() => {
    stopSpeaking()
    memory.current = {}
    setMessages([])
  }, [])

  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAiOpen((o) => !o)
        setSageDot(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  /* ---------- actions shared across pages ---------- */
  const addClient = useCallback(
    (c) => {
      setClients((list) => [{ id: uid(), joined: new Date(), spent: 0, hue: Math.floor(Math.random() * 360), ...c }, ...list])
      toast('Client added', `${c.name} is now one of your ${(M.totalUsers + 1).toLocaleString('en-US')} users.`, { icon: 'users' })
    },
    [M.totalUsers, toast],
  )
  const removeClient = useCallback(
    (id) => {
      const c = clients.find((x) => x.id === id)
      setClients((list) => list.filter((x) => x.id !== id))
      if (c) toast('Client removed', `${c.name} was removed.`, { icon: 'trash' })
    },
    [clients, toast],
  )
  const sendTransfer = useCallback(
    ({ to, amount, note }) => {
      setTransfers((list) => [{ id: uid(), who: to, dir: 'out', amount, note: note || 'Transfer', at: new Date(), fresh: true }, ...list])
      setDaily((rows) => {
        const last = rows[rows.length - 1]
        return [...rows.slice(0, -1), { ...last, balance: last.balance - amount }]
      })
      toast('Transfer sent', `${money(amount)} is on its way to ${to}.`, { icon: 'send' })
    },
    [toast],
  )

  const signOut = useCallback(() => {
    setModal(null)
    setAiOpen(false)
    setSignedOut(true)
  }, [])
  const signIn = useCallback(() => {
    setSignedOut(false)
    setBooting(true)
    setBootKey((k) => k + 1)
    go('dashboard')
  }, [go])

  const ctx = useMemo(
    () => ({
      view, go, booting, theme, switchTheme, reduceMotion, setReduceMotion,
      admin, mode, setMode, daily, M, clients, addClient, removeClient, transfers, sendTransfer, cards, setCards,
      events, setEvents, notifications, setNotifications, live, liveOn, setLiveOn, target, setTarget,
      ai, setAi, ask, aiOpen, setAiOpen, sageDot, setSageDot, speaking, spot, spotlight,
      toast, openModal, signOut,
    }),
    [
      view, go, booting, theme, switchTheme, reduceMotion, admin, mode, daily, M, clients, addClient, removeClient,
      transfers, sendTransfer, cards, events, notifications, live, liveOn, target, ai, ask, aiOpen, sageDot,
      speaking, spot, spotlight, toast, openModal, signOut,
    ],
  )

  const current = NAV.find((v) => v.id === view) ?? NAV[0]

  if (signedOut) {
    return (
      <div className="signed-out">
        <div className="so-card">
          <Logo size={64} />
          <h2>You’re signed out</h2>
          <p>See you soon, {admin.first}. Estaro keeps everything on this device.</p>
          <button type="button" className="btn sage" onClick={signIn}>
            Sign back in
          </button>
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app ${booting ? 'booting' : ''} ${aiOpen ? 'ai-docked' : ''}`} key={bootKey}>
        <Header title={current.title(admin)} sub={current.sub} />
        <div className="frame">
          <Rail />
          <Main key={view} page={PAGES[current.id]} booting={booting} />
        </div>
      </div>

      <SagePanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        messages={messages}
        busy={busy}
        onAsk={ask}
        onClear={clearChat}
        onTyped={markTyped}
      />

      {!aiOpen ? (
        <button
          type="button"
          className={`sage-fab ${arrived ? '' : 'waiting'}`}
          onClick={() => {
            setAiOpen(true)
            setSageDot(false)
          }}
          aria-label="Ask Estaro (⌘J)"
        >
          <Orb size={34} />
          <span className="fab-txt">Ask Estaro</span>
        </button>
      ) : null}
      {arrived ? null : <SageArrival onDone={arrive} skip={aiOpen} />}

      <AddCardModal open={modal?.type === 'addCard'} onClose={closeModal} />
      <AddClientModal open={modal?.type === 'addClient'} onClose={closeModal} />
      <TransferModal open={modal?.type === 'transfer'} onClose={closeModal} />
      <LogoutModal open={modal?.type === 'logout'} onClose={closeModal} />
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  )
}
