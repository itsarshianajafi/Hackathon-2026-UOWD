/* ------------------------------------------------------------------
   Estaro — the dashboard's assistant. 100% local, no API key.

   Understands English and Roman Urdu/Hindi questions ("is mahine
   kitni sales hui?", "total kitne users hain?") and answers straight
   from the dashboard's own metrics, with charts. Each answer's `say`
   key sets the mood Estaro's face reacts with (see moodFor).
   ------------------------------------------------------------------ */
import { ago, clock, DAYS_LONG, MONTHS_LONG, money, num, sameDay, addDays } from './format'
import { monthPeriod, totals } from './metrics'

/* ---------------- text helpers ---------------- */
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/booking\.com/g, 'bookingcom')
    .replace(/[^a-z0-9$%.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Word-start match for any of the `|` separated stems. */
const has = (q, stems) => new RegExp(`\\b(?:${stems})`).test(q)
/** Whole-word match. */
const word = (q, words) => new RegExp(`\\b(?:${words})\\b`).test(q)

const UR_WORDS =
  'kitn\\w*|kitt\\w*|hai|hain|hay|hua|hui|huy\\w*|hue|bata\\w*|btao|kya|kia|kaun|kholo|khol|chalao|lagao|jao|chalo|salam|assalam\\w*|aoa|shukriya|shukria|kon|konsa|kaunsa|kaunsi|konsi|aaj|aj|kal|mahin\\w*|mahen\\w*|saal|haft\\w*|kis|kaise|kaisa|kaisi|wala|wali|karo|kardo|kar|krdo|dikha\\w*|mera|mere|meri|hum|hamar\\w*|abhi|sab|zyada|jyada|ziada|sabse|paisa|paise|kamai|bikri|log|naye|nae|naya|bhai|yaar|yar|mein|mai|ko|se|ka|ki|ke|tha|thi|raha|rahi|rahe|chal|aur|bhi|nahi|nahin|wo|ye|yeh|kuch|kitna|agar|har|din|kahan|kahaan|hoga|hogi|honge|hongi|ho|jaye|jaaye|jayega|jayegi|kam|mehng\\w*|sasta|khatam|kamaye|kamao|kharch\\w*|bolo|dekho|chahiye|chahie|pata|sakta|sakte|liye|lie|tak|wale|waala|waali'

/** Estaro always replies in English. It still understands Roman Urdu questions; set this to 'auto' to reply in the asker's language. */
export const REPLY_LANG = 'en'

export const detectLang = (raw) => {
  const q = norm(raw)
  const hits = q.match(new RegExp(`\\b(?:${UR_WORDS})\\b`, 'g'))
  return hits && hits.length >= 2 ? 'ur' : hits && hits.length === 1 && q.split(' ').length <= 4 ? 'ur' : 'en'
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const agoUr = (d) => {
  const days = Math.round((Date.now() - d.getTime()) / 864e5)
  if (days <= 0) return 'aaj'
  if (days === 1) return 'kal'
  return `${days} din pehle`
}
const pick = (lang, en, ur) => (lang === 'ur' ? ur : en)
const abs1 = (n) => Math.abs(n).toFixed(1)

/* ---------------- vocabulary ---------------- */
const V = {
  sales: 'sale|sold|sell|revenue|bikri|bika|bike|bech|kamai|kamay|earn|income|turnover|gross|aamdani|amdani|paise? aay|paisa aay|money in|money came',
  profit: 'profit|munaf|faida|fayda|net\\b|bachat|margin|saving|saves',
  expenses: 'expens|spent|spend|kharch|cost|outgoing|bills?\\b',
  orders: 'order|bookings?\\b|reservation|stays?\\b',
  visitors: 'visitor|traffic|views?\\b|visits?\\b|conversion',
  users: 'user|client|customer|\\blog\\b|logon|logo\\b|member|signup|sign up|signed up|grahak|registr|subscriber',
  balance: 'balance|bank\\b|funds|cash\\b|account me|account mai|paisa kitna|kitna paisa|kitne paise hai|paise kitne hai',
  transfers: 'transfer|payment|paid\\b|bheja|bheje|bheji|received|transaction|len den|lein dein',
  properties: 'propert|ghar|flats?\\b|units?\\b|building|occupan|vacan|khali|bhari',
  channels: 'channel|sources?\\b|airbnb|bookingcom|direct\\b|referral|kahan se',
  schedule: 'meeting|schedule|events?\\b|calendar|appointment|agenda|viewing',
  target: 'target|goal|lakshya|hadaf',
  compare: 'compar|\\bvs\\b|versus|muqabl|mukabl|growth|grow|badh|barh|increas|decreas|ghat|trend|change|farq|difference',
  best: 'best|top\\b|highest|most\\b|sabse zyada|sab se zyada|sabse acha|sabse achi|sabse badi|sabse bara|number one|no 1',
  worst: 'worst|lowest|least|sabse kam|sab se kam|weakest|kharab',
  summary: 'summary|overview|report|sab kuch|sabkuch|everything|haal|status|kaisa chal|kaise chal|how are we|how is business|how s business|business kaisa|brief|recap|pulse|whats up',
}

const PAGES = [
  { id: 'dashboard', words: 'dashboard|home|overview|main page' },
  { id: 'analytics', words: 'analytics|reports?|charts?|graphs?|stats' },
  { id: 'clients', words: 'clients?|users?|customers?' },
  { id: 'properties', words: 'propert\\w*' },
  { id: 'schedule', words: 'schedule|calendar|events?' },
]
const PAGE_NAME = {
  dashboard: ['Dashboard', 'Dashboard'],
  analytics: ['Analytics', 'Analytics'],
  clients: ['Clients', 'Clients'],
  properties: ['Properties', 'Properties'],
  schedule: ['Schedule', 'Schedule'],
}

const MONTH_RE = [
  'jan|january',
  'feb|february|febuary',
  'mar|march',
  'apr|april',
  'may',
  'jun|june',
  'jul|july',
  'aug|august',
  'sep|sept|september',
  'oct|october',
  'nov|november',
  'dec|december',
]

/* ---------------- period detection ---------------- */
const PREV = 'last|previous|prev|pichl\\w*|pichhl\\w*|gaya|gaye|guzr\\w*|past'
const THIS = 'this|is|current|chalu|abhi wala|iss'

function detectPeriods(q, today) {
  const found = []
  const push = (key, idx = 0) => found.push({ key, idx })
  MONTH_RE.forEach((re, m) => {
    const r = new RegExp(`\\b(?:${re})\\b`)
    const hit = q.match(r)
    if (hit) found.push({ key: `m${m}`, idx: hit.index, month: m })
  })
  const at = (re) => {
    const m = q.match(new RegExp(re))
    return m ? m.index : -1
  }
  let i
  if ((i = at('\\b(today|todays|aaj|aj)\\b')) >= 0) push('today', i)
  if ((i = at('\\b(yesterday|kal)\\b')) >= 0) push('yesterday', i)
  if ((i = at(`\\b(${PREV}) (week|hafte|hafta|hafty)`)) >= 0) push('lastWeek', i)
  if ((i = at(`\\b(${THIS}) (week|hafte|hafta|hafty)`)) >= 0) push('week', i)
  else if ((i = at('\\b(week|hafte|hafta|hafty|weekly)\\b')) >= 0 && !found.some((f) => f.key === 'lastWeek')) push('week', i)
  if ((i = at(`\\b(${PREV}) (month|mahin\\w*|mahen\\w*)`)) >= 0) push('lastMonth', i)
  if ((i = at(`\\b(${THIS}) (month|mahin\\w*|mahen\\w*)`)) >= 0) push('month', i)
  else if ((i = at('\\b(month|mahin\\w*|mahen\\w*|monthly|mtd)\\b')) >= 0 && !found.some((f) => f.key === 'lastMonth')) push('month', i)
  if ((i = at(`\\b(${PREV}) (year|saal|sal)\\b`)) >= 0) push('lastYear', i)
  if ((i = at(`\\b(${THIS}) (year|saal|sal)\\b`)) >= 0) push('year', i)
  else if ((i = at('\\b(year|saal|sal|ytd|annual|yearly)\\b')) >= 0 && !found.some((f) => f.key === 'lastYear')) push('year', i)
  if ((i = at('\\b(7|seven|saat) (din|days)')) >= 0) push('last7', i)
  if ((i = at('\\b(30|thirty|tees) (din|days)')) >= 0) push('last30', i)
  if ((i = at('\\b(all time|lifetime|shuru se|overall|ab tak ki total|since start)')) >= 0) push('all', i)
  found.sort((a, b) => a.idx - b.idx)
  // de-duplicate, keep order of appearance
  const seen = new Set()
  return found
    .filter((f) => (seen.has(f.key) ? false : seen.add(f.key)))
    .map((f) => {
      if (f.month != null) return { key: f.key, ...monthPeriod(today, f.month) }
      return { key: f.key }
    })
}

/** Resolve a detected period into a concrete totals object. */
function resolve(per, ctx) {
  const { M, daily } = ctx
  if (per.start) return { ...totals(daily, per.start, per.end), en: per.en, ur: per.ur, key: per.key }
  return M.T[per.key]
}

const PREV_OF = { today: 'yesterdaySame', week: 'lastWeekSame', month: 'lastMonthSame', year: 'lastYearSame' }

/* ---------------- block helpers ---------------- */
const dailyBars = (t, field) => {
  const rows = t.rows ?? []
  if (rows.length < 2 || rows.length > 31) return null
  return {
    type: 'bars',
    fmt: field === 'signups' || field === 'orders' ? 'num' : 'money',
    items: rows.map((r) => ({ label: `${r.date.getDate()}`, v: r[field] })),
  }
}

const monthBars = (M, field, fmt = 'money') => ({
  type: 'bars',
  fmt,
  items: M.months.map((m) => ({ label: m.label, v: m[field] })),
})

/* ------------------------------------------------------------------
   Intent handlers. Each returns { text, blocks?, spot?, suggest? }.
   ------------------------------------------------------------------ */
function salesAnswer(t, ctx, lang) {
  const { M } = ctx
  const prevKey = PREV_OF[t.key]
  const prev = prevKey ? M.T[prevKey] : null
  const g = prev && prev.rev ? ((t.rev - prev.rev) / prev.rev) * 100 : null
  let text = pick(
    lang,
    `You made **${money(t.rev)}** in sales ${t.en} from **${num(t.orders)} bookings**.`,
    `${cap(t.ur)} total sales **${money(t.rev)}** hui hain, **${num(t.orders)} bookings** se.`,
  )
  if (g != null)
    text += pick(
      lang,
      ` That's **${abs1(g)}% ${g >= 0 ? 'higher' : 'lower'}** than ${prev.en}.`,
      ` Ye ${prev.ur} se **${abs1(g)}% ${g >= 0 ? 'zyada' : 'kam'}** hai.`,
    )
  const blocks = [{ type: 'stat', label: pick(lang, `Sales · ${t.en}`, `Sales · ${t.ur}`), value: t.rev, fmt: 'money', delta: g }]
  const bars = t.key === 'year' || t.key === 'all' || t.key === 'lastYear' ? monthBars(M, 'rev') : dailyBars(t, 'rev')
  if (bars) blocks.push(bars)
  return {
    text,
    blocks,
    spot: t.key === 'today' ? 'earningsToday' : 'earnings',
    say: g == null ? 'sales' : g >= 0 ? 'sales-up' : 'sales-down',
    suggest: pick(lang, ['Compare with last month', 'What was my best month?', 'Which property earns most?'], [
      'Pichle mahine se compare karo',
      'Sabse best mahina kaunsa tha?',
      'Kaunsi property sabse zyada kamati hai?',
    ]),
  }
}

function profitAnswer(t, ctx, lang) {
  const { M } = ctx
  const prevKey = PREV_OF[t.key]
  const prev = prevKey ? M.T[prevKey] : null
  const g = prev && prev.profit ? ((t.profit - prev.profit) / Math.abs(prev.profit)) * 100 : null
  let text = pick(
    lang,
    `Net profit ${t.en} is **${money(t.profit)}**: ${money(t.rev)} in sales minus ${money(t.exp)} in costs, a **${t.margin.toFixed(1)}% margin**.`,
    `${cap(t.ur)} net munafa **${money(t.profit)}** hai. Sales ${money(t.rev)} mein se kharcha ${money(t.exp)} nikal ke, margin **${t.margin.toFixed(1)}%** hai.`,
  )
  if (g != null)
    text += pick(
      lang,
      ` Profit is ${abs1(g)}% ${g >= 0 ? 'more' : 'less'} than ${prev.en}.`,
      ` Ye ${prev.ur} se ${abs1(g)}% ${g >= 0 ? 'zyada' : 'kam'} hai.`,
    )
  return {
    text,
    blocks: [
      {
        type: 'stats',
        items: [
          { label: pick(lang, 'Sales', 'Sales'), value: t.rev, fmt: 'money' },
          { label: pick(lang, 'Costs', 'Kharcha'), value: t.exp, fmt: 'money' },
          { label: pick(lang, 'Profit', 'Munafa'), value: t.profit, fmt: 'money', hot: true },
        ],
      },
    ],
    spot: t.key === 'today' ? 'activity' : 'earnings',
    say: g == null ? 'profit' : g >= 0 ? 'profit-up' : 'profit-down',
    suggest: pick(lang, ['How much did I spend?', 'Show my balance'], ['Kitna kharcha hua?', 'Balance kitna hai?']),
  }
}

function expensesAnswer(t, ctx, lang) {
  const { M } = ctx
  const prevKey = PREV_OF[t.key]
  const prev = prevKey ? M.T[prevKey] : null
  const g = prev && prev.exp ? ((t.exp - prev.exp) / prev.exp) * 100 : null
  let text = pick(lang, `You spent **${money(t.exp)}** ${t.en}.`, `${cap(t.ur)} total kharcha **${money(t.exp)}** hua hai.`)
  if (g != null)
    text += pick(
      lang,
      ` That's ${abs1(g)}% ${g >= 0 ? 'more' : 'less'} than ${prev.en}.`,
      ` Ye ${prev.ur} se ${abs1(g)}% ${g >= 0 ? 'zyada' : 'kam'} hai.`,
    )
  const blocks = [{ type: 'stat', label: pick(lang, `Spent · ${t.en}`, `Kharcha · ${t.ur}`), value: t.exp, fmt: 'money', delta: g, invert: true }]
  const bars = t.key === 'year' || t.key === 'all' ? monthBars(M, 'exp') : dailyBars(t, 'exp')
  if (bars) blocks.push(bars)
  return { text, blocks, spot: 'spent', say: g == null ? 'spend' : g >= 0 ? 'spend-more' : 'spend-less' }
}

function ordersAnswer(t, ctx, lang) {
  return {
    text: pick(
      lang,
      `**${num(t.orders)} bookings** came in ${t.en}, with an average ticket of **${money(t.ticket)}**.`,
      `${cap(t.ur)} **${num(t.orders)} bookings** aayi hain, average ticket **${money(t.ticket)}** ka.`,
    ),
    blocks: [{ type: 'stat', label: pick(lang, `Bookings · ${t.en}`, `Bookings · ${t.ur}`), value: t.orders, fmt: 'num' }, dailyBars(t, 'orders')].filter(Boolean),
    spot: 'earnings',
    say: 'orders',
  }
}

function visitorsAnswer(t, ctx, lang) {
  return {
    text: pick(
      lang,
      `**${num(t.visitors)} visitors** ${t.en}, and **${t.conversion.toFixed(2)}%** of them booked.`,
      `${cap(t.ur)} **${num(t.visitors)} visitors** aaye, jinmein se **${t.conversion.toFixed(2)}%** ne booking ki.`,
    ),
    blocks: [{ type: 'stat', label: pick(lang, 'Visitors', 'Visitors'), value: t.visitors, fmt: 'num' }],
    say: 'visitors',
  }
}

function usersAnswer(q, per, ctx, lang) {
  const { M, clients, daily } = ctx
  const spark = { type: 'spark', values: daily.slice(-14).map((r) => r.signups), label: pick(lang, 'Sign-ups, last 14 days', 'Sign-ups, pichle 14 din') }

  if (has(q, 'pending|inactive|blocked|band|ruk')) {
    const st = has(q, 'pending') ? 'Pending' : 'Inactive'
    const list = clients.filter((c) => c.status === st)
    return {
      text: pick(
        lang,
        `**${list.length} clients** are ${st.toLowerCase()} right now.${list.length ? ` The latest is ${list[0].name}.` : ''}`,
        `Abhi **${list.length} clients** ${st.toLowerCase()} hain.${list.length ? ` Sabse naya ${list[0].name} hai.` : ''}`,
      ),
      blocks: list.length
        ? [{ type: 'list', items: list.slice(0, 4).map((c) => ({ title: c.name, sub: `${c.plan} · ${c.property}`, value: ago(c.joined), hue: c.hue })) }]
        : [],
      spot: 'recent',
      say: 'users-status',
      action: null,
      suggest: pick(lang, ['Open clients page'], ['Clients page kholo']),
    }
  }

  if (has(q, 'active|online|chal rahe|zinda')) {
    const share = (M.activeUsers / M.totalUsers) * 100
    return {
      text: pick(
        lang,
        `**${num(M.activeUsers)}** of your **${num(M.totalUsers)}** users are active (${share.toFixed(1)}%).`,
        `Aapke **${num(M.totalUsers)}** users mein se **${num(M.activeUsers)} active** hain (${share.toFixed(1)}%).`,
      ),
      blocks: [
        {
          type: 'stats',
          items: [
            { label: pick(lang, 'Active', 'Active'), value: M.activeUsers, fmt: 'num', hot: true },
            { label: pick(lang, 'Total', 'Total'), value: M.totalUsers, fmt: 'num' },
          ],
        },
      ],
      spot: 'clients',
      say: 'users-active',
    }
  }

  const wantsNew = has(q, 'new|naye|nae|naya|nai\\b|joined|join|signup|sign up|signed|registr|aaye|aye\\b|added')
  if (wantsNew || per) {
    const t = per ? resolve(per, ctx) : M.T.month
    const n = t.key === 'today' ? M.newUsers.today : t.key === 'week' ? M.newUsers.week : t.key === 'month' ? M.newUsers.month : t.key === 'year' ? M.newUsers.year : t.signups
    let text = pick(lang, `**${num(n)} new clients** joined ${t.en}.`, `${cap(t.ur)} **${num(n)} naye clients** aaye hain.`)
    if (t.key === 'month')
      text += pick(
        lang,
        ` That's ${abs1(M.growth.usersMonth)}% ${M.growth.usersMonth >= 0 ? 'more' : 'fewer'} than the same point last month.`,
        ` Ye pichle mahine isi waqt se ${abs1(M.growth.usersMonth)}% ${M.growth.usersMonth >= 0 ? 'zyada' : 'kam'} hai.`,
      )
    text += pick(lang, ` You now have **${num(M.totalUsers)} users** in total.`, ` Ab total **${num(M.totalUsers)} users** hain.`)
    return {
      text,
      blocks: [{ type: 'stat', label: pick(lang, `New clients · ${t.en}`, `Naye clients · ${t.ur}`), value: n, fmt: 'num', delta: t.key === 'month' ? M.growth.usersMonth : null }, spark],
      spot: 'clients',
      say: t.key === 'month' ? (M.growth.usersMonth >= 0 ? 'users-up' : 'users-down') : 'users-new',
      suggest: pick(lang, ['How many are active?', 'Who are my top clients?'], ['Kitne active hain?', 'Top clients kaun hain?']),
    }
  }

  return {
    text: pick(
      lang,
      `You have **${num(M.totalUsers)} users** in total. **${num(M.activeUsers)}** are active and **${num(M.newUsers.month)}** joined this month.`,
      `Aapke paas total **${num(M.totalUsers)} users** hain. Inmein se **${num(M.activeUsers)} active** hain aur is mahine **${num(M.newUsers.month)} naye** aaye.`,
    ),
    blocks: [
      {
        type: 'stats',
        items: [
          { label: pick(lang, 'Total', 'Total'), value: M.totalUsers, fmt: 'num', hot: true },
          { label: pick(lang, 'Active', 'Active'), value: M.activeUsers, fmt: 'num' },
          { label: pick(lang, 'New · month', 'Naye · mahina'), value: M.newUsers.month, fmt: 'num' },
        ],
      },
      spark,
    ],
    spot: 'clients',
    say: 'users',
    suggest: pick(lang, ['How many joined today?', 'Who are my top clients?'], ['Aaj kitne naye aaye?', 'Top clients kaun hain?']),
  }
}

function balanceAnswer(ctx, lang) {
  const { M } = ctx
  const s = M.balanceSeries.monthly
  const g = ((s[s.length - 1] - s[0]) / s[0]) * 100
  return {
    text: pick(
      lang,
      `Your balance is **${money(M.balance)}**, ${abs1(g)}% ${g >= 0 ? 'up' : 'down'} over 30 days. You're keeping **${M.T.month.margin.toFixed(1)}%** of every sale this month.`,
      `Aapka current balance **${money(M.balance)}** hai, 30 din mein ${abs1(g)}% ${g >= 0 ? 'barha' : 'ghata'}. Is mahine har sale ka **${M.T.month.margin.toFixed(1)}%** bach raha hai.`,
    ),
    blocks: [
      { type: 'stat', label: pick(lang, 'Balance', 'Balance'), value: M.balance, fmt: 'money', delta: g },
      { type: 'spark', values: s, label: pick(lang, 'Last 30 days', 'Pichle 30 din') },
    ],
    spot: 'balance',
    say: g >= 0 ? 'balance-up' : 'balance-down',
  }
}

function transfersAnswer(ctx, lang) {
  const { transfers } = ctx
  const now = new Date()
  const today = transfers.filter((t) => sameDay(t.at, now))
  const inn = today.filter((t) => t.dir === 'in').reduce((s, t) => s + t.amount, 0)
  const out = today.filter((t) => t.dir === 'out').reduce((s, t) => s + t.amount, 0)
  const last = transfers[0]
  return {
    text: pick(
      lang,
      `Today **${money(inn)}** came in and **${money(out)}** went out across ${today.length} transfers. The latest: ${last.dir === 'in' ? `${last.who} sent you` : `you paid ${last.who}`} ${money(last.amount)}.`,
      `Aaj **${money(inn)}** aaye aur **${money(out)}** gaye, total ${today.length} transfers. Aakhri: ${last.dir === 'in' ? `${last.who} ne ${money(last.amount)} bheje` : `aapne ${last.who} ko ${money(last.amount)} bheje`}.`,
    ),
    blocks: [
      {
        type: 'list',
        items: transfers.slice(0, 4).map((t) => ({
          title: `${t.dir === 'in' ? 'From' : 'To'} ${t.who}`,
          sub: t.note,
          value: `${t.dir === 'in' ? '+' : '−'}${money(t.amount)}`,
          tone: t.dir === 'in' ? 'up' : 'down',
        })),
      },
    ],
    spot: 'transfers',
    say: 'transfers',
  }
}

function propertiesAnswer(q, ctx, lang, mode) {
  const { M } = ctx
  const named = M.properties.find((p) => q.includes(p.name.toLowerCase()) || q.includes(p.name.toLowerCase().split(' ')[0]))
  if (named) {
    return {
      text: pick(
        lang,
        `**${named.name}** (${named.city}) made **${money(named.rev)}** this month. ${named.occupied} of ${named.units} units are booked (${named.occupancy.toFixed(0)}%) and guests rate it ${named.rating}★.`,
        `**${named.name}** (${named.city}) ne is mahine **${money(named.rev)}** kamaye. ${named.units} mein se ${named.occupied} units booked hain (${named.occupancy.toFixed(0)}%), rating ${named.rating}★ hai.`,
      ),
      blocks: [
        {
          type: 'stats',
          items: [
            { label: pick(lang, 'Revenue', 'Kamai'), value: named.rev, fmt: 'money', hot: true },
            { label: pick(lang, 'Occupancy', 'Occupancy'), value: named.occupancy, fmt: 'pct' },
          ],
        },
      ],
      say: 'property',
    }
  }
  if (has(q, 'rating|rated|stars?\\b|review')) {
    const sorted = [...M.properties].sort((a, b) => (mode === 'worst' ? a.rating - b.rating : b.rating - a.rating))
    const p = sorted[0]
    return {
      text: pick(
        lang,
        `**${p.name}** in ${p.city} has the ${mode === 'worst' ? 'lowest' : 'best'} guest rating: **${p.rating}★**.`,
        `Sabse ${mode === 'worst' ? 'kam' : 'achhi'} rating **${p.name}** (${p.city}) ki hai: **${p.rating}★**.`,
      ),
      blocks: [{ type: 'list', items: sorted.slice(0, 4).map((x) => ({ title: x.name, sub: `${x.city} · ${x.occupancy.toFixed(0)}% booked`, value: `${x.rating}★`, hue: x.hue })) }],
      say: 'properties',
    }
  }
  if (has(q, 'occupan|khali|vacan|bhari|empty|full')) {
    const sorted = [...M.properties].sort((a, b) => (mode === 'worst' || has(q, 'khali|vacan|empty|kam') ? a.occupancy - b.occupancy : b.occupancy - a.occupancy))
    return {
      text: pick(
        lang,
        `Overall occupancy is **${M.occupancy.toFixed(0)}%**. ${sorted[0].name} is at ${sorted[0].occupancy.toFixed(0)}%.`,
        `Overall occupancy **${M.occupancy.toFixed(0)}%** hai. ${sorted[0].name} ${sorted[0].occupancy.toFixed(0)}% par hai.`,
      ),
      blocks: [{ type: 'bars', fmt: 'pct', items: sorted.map((p) => ({ label: p.name.split(' ')[0], v: p.occupancy })) }],
      say: 'properties',
    }
  }
  const list = mode === 'worst' ? [...M.properties].reverse() : M.properties
  const top = list[0]
  return {
    text:
      mode === 'worst'
        ? pick(
            lang,
            `**${top.name}** is earning the least this month at **${money(top.rev)}**.`,
            `Is mahine sabse kam kamai **${top.name}** ki hai: **${money(top.rev)}**.`,
          )
        : pick(
            lang,
            `**${top.name}** is your top property this month with **${money(top.rev)}** in sales.`,
            `Is mahine sabse zyada kamai **${top.name}** ki hai: **${money(top.rev)}**.`,
          ),
    blocks: [{ type: 'list', items: list.slice(0, 4).map((p) => ({ title: p.name, sub: `${p.city} · ${p.occupancy.toFixed(0)}% booked`, value: money(p.rev, 0), hue: p.hue })) }],
    say: 'properties',
    suggest: pick(lang, ['Open properties page'], ['Properties page kholo']),
  }
}

// "bookings" must not read as Booking.com, so match whole words (booking.com is normalised to "bookingcom")
const CHANNEL_WORDS = { direct: 'direct', airbnb: 'airbnb', booking: 'bookingcom|booking com', referral: 'referrals?' }
const namedChannel = (q, M) => M.channels.find((c) => word(q, CHANNEL_WORDS[c.id] ?? c.id))

function channelsAnswer(q, ctx, lang) {
  const { M } = ctx
  const one = namedChannel(q, M)
  if (one)
    return {
      text: pick(
        lang,
        `**${one.name}** brought **${num(one.orders)} bookings** worth **${money(one.rev)}** this month, ${(one.share * 100).toFixed(0)}% of all sales.`,
        `Is mahine **${one.name}** se **${num(one.orders)} bookings** aayi, jinki value **${money(one.rev)}** hai. Ye total sales ka ${(one.share * 100).toFixed(0)}% hai.`,
      ),
      blocks: [{ type: 'bars', fmt: 'money', items: M.channels.map((c) => ({ label: c.name.replace('.com', ''), v: c.rev })), hot: M.channels.indexOf(one) }],
      say: 'channels',
    }
  const top = [...M.channels].sort((a, b) => b.rev - a.rev)
  return {
    text: pick(
      lang,
      `Most bookings come from **${top[0].name}** (${(top[0].share * 100).toFixed(0)}%), then ${top[1].name} and ${top[2].name}.`,
      `Sabse zyada bookings **${top[0].name}** se aati hain (${(top[0].share * 100).toFixed(0)}%), phir ${top[1].name} aur ${top[2].name}.`,
    ),
    blocks: [{ type: 'bars', fmt: 'money', items: top.map((c) => ({ label: c.name.replace('.com', ''), v: c.rev })) }],
    say: 'channels',
  }
}

function scheduleAnswer(q, ctx, lang) {
  const { events } = ctx
  const now = new Date()
  const tomorrow = word(q, 'tomorrow|kal')
  const day = tomorrow ? addDays(now, 1) : now
  const list = events.filter((e) => sameDay(e.at, day)).sort((a, b) => a.at - b.at)
  const when = tomorrow ? pick(lang, 'tomorrow', 'kal') : pick(lang, 'today', 'aaj')
  return {
    text: list.length
      ? pick(lang, `You have **${list.length} events** ${when}. First up: ${list[0].title} at ${clock(list[0].at)}.`, `${cap(when)} **${list.length} events** hain. Sabse pehle: ${list[0].title}, ${clock(list[0].at)} baje.`)
      : pick(lang, `Nothing on the calendar ${when}.`, `${cap(when)} calendar khali hai.`),
    blocks: list.length ? [{ type: 'list', items: list.map((e) => ({ title: e.title, sub: e.who, value: clock(e.at) })) }] : [],
    say: list.length ? 'schedule-busy' : 'schedule-free',
  }
}

function targetAnswer(ctx, lang) {
  const { M } = ctx
  const t = M.T.month
  const dim = new Date(M.today.getFullYear(), M.today.getMonth() + 1, 0).getDate()
  const left = dim - M.today.getDate()
  const projection = (t.rev / t.days) * dim
  const remaining = Math.max(0, M.target - t.rev)
  return {
    text: pick(
      lang,
      `You're at **${M.targetPct.toFixed(0)}%** of your ${money(M.target, 0)} monthly target. ${remaining ? `${money(remaining)} to go with ${left} days left.` : 'Target smashed!'} At this pace you'll close the month near **${money(projection, 0)}**.`,
      `Aap ${money(M.target, 0)} ke monthly target ka **${M.targetPct.toFixed(0)}%** poora kar chuke ho. ${remaining ? `${left} din mein ${money(remaining)} aur chahiye.` : 'Target poora ho gaya!'} Isi speed se mahina **${money(projection, 0)}** ke aas paas khatam hoga.`,
    ),
    blocks: [{ type: 'progress', value: Math.min(100, M.targetPct), label: pick(lang, 'Monthly target', 'Monthly target') }],
    spot: 'earnings',
    say: !remaining ? 'target-hit' : projection >= M.target ? 'target-on' : 'target-behind',
  }
}

function bestAnswer(q, ctx, lang, mode) {
  const { M } = ctx
  if (has(q, V.users) && !has(q, 'month|mahin|day|din')) {
    const list = mode === 'worst' ? [...ctx.clients].sort((a, b) => a.spent - b.spent).slice(0, 5) : M.topClients
    return {
      text:
        mode === 'worst'
          ? pick(lang, `Your lowest-spending client is **${list[0].name}** (${money(list[0].spent)}).`, `Sabse kam kharch karne wale client **${list[0].name}** hain (${money(list[0].spent)}).`)
          : pick(lang, `Your top client is **${list[0].name}**, who has spent **${money(list[0].spent)}**.`, `Aapke top client **${list[0].name}** hain, inhone **${money(list[0].spent)}** kharch kiye.`),
      blocks: [{ type: 'list', items: list.slice(0, 4).map((c) => ({ title: c.name, sub: `${c.plan} · ${c.property}`, value: money(c.spent, 0), hue: c.hue })) }],
      spot: 'recent',
      say: mode,
    }
  }
  if (has(q, V.properties)) return { ...propertiesAnswer(q, ctx, lang, mode), say: mode }
  if (has(q, V.channels)) return { ...channelsAnswer(q, ctx, lang), say: mode }
  if (has(q, 'day\\b|days|din\\b|weekday|roz')) {
    const d = mode === 'worst' ? M.worstDow : M.bestDow
    const lift = ((d.avg - M.dowAvg) / M.dowAvg) * 100
    return {
      text: pick(
        lang,
        `**${d.day}** is your ${mode === 'worst' ? 'slowest' : 'best'} day: about **${money(d.avg, 0)}** in sales, ${abs1(lift)}% ${lift >= 0 ? 'above' : 'below'} average. Your best single day lately was ${DAYS_LONG[M.bestDay.date.getDay()]} ${M.bestDay.date.getDate()} ${MONTHS_LONG[M.bestDay.date.getMonth()]} (${money(M.bestDay.rev)}).`,
        `**${d.day}** aapka ${mode === 'worst' ? 'sabse slow' : 'sabse best'} din hai: average **${money(d.avg, 0)}** sales, jo normal se ${abs1(lift)}% ${lift >= 0 ? 'zyada' : 'kam'} hai. Haal mein sabse acha din ${M.bestDay.date.getDate()} ${MONTHS_LONG[M.bestDay.date.getMonth()]} tha (${money(M.bestDay.rev)}).`,
      ),
      blocks: [{ type: 'bars', fmt: 'money', items: M.byDow.map((x) => ({ label: x.short, v: x.avg })), hot: M.byDow.indexOf(d) }],
      spot: 'activity',
      say: mode,
    }
  }
  const m = mode === 'worst' ? M.worstMonth : M.bestMonth
  return {
    text: pick(
      lang,
      `**${m.long}** was your ${mode === 'worst' ? 'weakest' : 'best'} month with **${money(m.rev)}** in sales and ${money(m.profit)} profit.`,
      `**${m.long}** aapka ${mode === 'worst' ? 'sabse kamzor' : 'sabse best'} mahina tha: **${money(m.rev)}** sales aur ${money(m.profit)} munafa.`,
    ),
    blocks: [{ type: 'bars', fmt: 'money', items: M.months.map((x) => ({ label: x.label, v: x.rev })), hot: M.months.indexOf(m) }],
    spot: 'balance',
    say: mode,
  }
}

function compareAnswer(q, pers, ctx, lang) {
  const { M } = ctx
  let a
  let b
  const keys = pers.map((p) => p.key)
  const pair = (x, y) => keys.includes(x) && keys.includes(y)
  if (pair('month', 'lastMonth') || pair('week', 'lastWeek') || pair('year', 'lastYear') || pair('today', 'yesterday')) {
    // a running period is always compared with the same stretch of the previous one
    const base = ['month', 'week', 'year', 'today'].find((k) => keys.includes(k))
    a = M.T[base]
    b = M.T[PREV_OF[base]]
  } else if (pers.length >= 2) {
    a = resolve(pers[0], ctx)
    b = resolve(pers[1], ctx)
  } else {
    // "pichle mahine se compare karo" / "compare with last week" means now vs that period
    const CURRENT_OF = { lastMonth: 'month', lastWeek: 'week', lastYear: 'year', yesterday: 'today' }
    const k = CURRENT_OF[pers[0]?.key] ?? pers[0]?.key
    if (pers[0]?.start) {
      // a named month vs the month before it
      a = resolve(pers[0], ctx)
      const s = pers[0].start
      b = { ...totals(ctx.daily, new Date(s.getFullYear(), s.getMonth() - 1, 1), s), en: 'the month before', ur: 'usse pehle wale mahine' }
    } else {
      const base = k && PREV_OF[k] ? k : 'month'
      a = M.T[base]
      b = M.T[PREV_OF[base]]
    }
  }
  const metric = has(q, V.users) ? 'signups' : has(q, V.profit) ? 'profit' : has(q, V.expenses) ? 'exp' : has(q, V.orders) ? 'orders' : 'rev'
  const label = { rev: ['sales', 'sales'], profit: ['profit', 'munafa'], exp: ['spending', 'kharcha'], signups: ['new clients', 'naye clients'], orders: ['bookings', 'bookings'] }[metric]
  const fmt = metric === 'signups' || metric === 'orders' ? 'num' : 'money'
  const f = (v) => (fmt === 'num' ? num(v) : money(v))
  const g = b[metric] ? ((a[metric] - b[metric]) / Math.abs(b[metric])) * 100 : 0
  return {
    text: pick(
      lang,
      `${cap(label[0])} ${a.en}: **${f(a[metric])}** vs **${f(b[metric])}** ${b.en}. That's **${abs1(g)}% ${g >= 0 ? 'up' : 'down'}**.`,
      `${cap(a.ur)} ${label[1]} **${f(a[metric])}** hai, aur ${b.ur} **${f(b[metric])}** thi. Yani **${abs1(g)}% ${g >= 0 ? 'zyada' : 'kam'}**.`,
    ),
    blocks: [
      {
        type: 'bars',
        fmt,
        items: [
          { label: cap(pick(lang, b.en, b.ur)).replace(/^In /, ''), v: b[metric] },
          { label: cap(pick(lang, a.en, a.ur)).replace(/^In /, ''), v: a[metric] },
        ],
        hot: 1,
        wide: true,
      },
    ],
    spot: metric === 'signups' ? 'clients' : 'earnings',
    say: g >= 0 ? 'compare-up' : 'compare-down',
  }
}

function summaryAnswer(ctx, lang) {
  const { M } = ctx
  const g = M.growth.revMonth
  return {
    text: pick(
      lang,
      `Here's the pulse. **${money(M.T.month.rev)}** in sales this month (${g >= 0 ? '+' : '−'}${abs1(g)}%), **${money(M.T.month.profit)}** profit, **${num(M.totalUsers)} users** with ${num(M.newUsers.month)} new, and **${money(M.balance)}** in the bank. Today so far: ${money(M.T.today.rev)} from ${M.T.today.orders} bookings.`,
      `Ye raha poora haal. Is mahine **${money(M.T.month.rev)}** sales (${g >= 0 ? '+' : '−'}${abs1(g)}%), **${money(M.T.month.profit)}** munafa, **${num(M.totalUsers)} users** jinmein ${num(M.newUsers.month)} naye, aur bank mein **${money(M.balance)}**. Aaj ab tak ${money(M.T.today.rev)} ki ${M.T.today.orders} bookings.`,
    ),
    blocks: [
      {
        type: 'stats',
        items: [
          { label: pick(lang, 'Sales · month', 'Sales · mahina'), value: M.T.month.rev, fmt: 'money', hot: true },
          { label: pick(lang, 'Profit', 'Munafa'), value: M.T.month.profit, fmt: 'money' },
          { label: pick(lang, 'Users', 'Users'), value: M.totalUsers, fmt: 'num' },
          { label: pick(lang, 'Balance', 'Balance'), value: M.balance, fmt: 'money' },
        ],
      },
    ],
    spot: 'earnings',
    say: g >= 0 ? 'summary-up' : 'summary-down',
    suggest: pick(lang, ['Which day sells best?', 'Am I on target?'], ['Kaunsa din sabse acha hai?', 'Target kitna hua?']),
  }
}

function clientAnswer(c, lang) {
  return {
    text: pick(
      lang,
      `**${c.name}** is ${/^[aeiou]/i.test(c.status) ? 'an' : 'a'} ${c.status.toLowerCase()} ${c.plan} client at ${c.property}. Joined ${ago(c.joined).toLowerCase()}, has spent **${money(c.spent)}**. Email: ${c.email}.`,
      `**${c.name}** ${c.property} mein ${c.plan} plan ke ${c.status.toLowerCase()} client hain. ${cap(agoUr(c.joined))} join kiya aur ab tak **${money(c.spent)}** kharch kiye. Email: ${c.email}.`,
    ),
    blocks: [{ type: 'list', items: [{ title: c.name, sub: `${c.status} · ${c.plan} · ${c.property}`, value: money(c.spent, 0), hue: c.hue }] }],
    spot: 'recent',
    say: 'client',
  }
}

/* ------------------------------------------------------------------
   "Why are sales down/up?" — explained from the data, not guessed
   ------------------------------------------------------------------ */
function whyAnswer(q, ctx, lang) {
  const { M } = ctx
  const monthly = has(q, 'month|mahin|mahen')
  const a = monthly ? M.T.month : M.T.today
  const b = monthly ? M.T.lastMonthSame : M.T.yesterdaySame
  const g = b.rev ? ((a.rev - b.rev) / b.rev) * 100 : 0
  const down = g < 0
  const day = M.byDow[M.today.getDay()]
  const dayGap = ((day.avg - M.dowAvg) / M.dowAvg) * 100
  const reasons = []
  if (!monthly && Math.abs(dayGap) > 5)
    reasons.push(
      pick(
        lang,
        `today is ${day.day}, which runs ${Math.abs(dayGap).toFixed(0)}% ${dayGap < 0 ? 'below' : 'above'} an average day (${money(day.avg, 0)} vs ${money(M.dowAvg, 0)}; ${M.bestDow.day} is best at ${money(M.bestDow.avg, 0)})`,
        `aaj ${day.day} hai, jo average din se ${Math.abs(dayGap).toFixed(0)}% ${dayGap < 0 ? 'slow' : 'tez'} hota hai (${money(day.avg, 0)} vs ${money(M.dowAvg, 0)}; sabse acha ${M.bestDow.day} ${money(M.bestDow.avg, 0)})`,
      ),
    )
  const ordersGap = b.orders ? ((a.orders - b.orders) / b.orders) * 100 : 0
  const ticketGap = b.ticket ? ((a.ticket - b.ticket) / b.ticket) * 100 : 0
  if (Math.abs(ordersGap) >= Math.abs(ticketGap))
    reasons.push(pick(lang, `bookings are ${a.orders} vs ${b.orders}`, `bookings ${b.orders} se ${a.orders} hui hain`))
  else
    reasons.push(pick(lang, `the average booking is ${money(a.ticket)} vs ${money(b.ticket)}`, `average booking ${money(b.ticket)} se ${money(a.ticket)} ho gayi`))
  const ctxLine = monthly
    ? ''
    : pick(
        lang,
        ` For the month you're still ${M.growth.revMonth >= 0 ? 'up' : 'down'} ${abs1(M.growth.revMonth)}%.`,
        ` Mahine ke hisaab se aap phir bhi ${abs1(M.growth.revMonth)}% ${M.growth.revMonth >= 0 ? 'upar' : 'neeche'} ho.`,
      )
  return {
    text:
      pick(
        lang,
        `Sales ${monthly ? 'this month' : 'today'} are **${abs1(g)}% ${down ? 'lower' : 'higher'}** than ${b.en} (${money(a.rev)} vs ${money(b.rev)}). Main reasons: ${reasons.join('; ')}.`,
        `${monthly ? 'Is mahine' : 'Aaj'} sales ${b.ur} se **${abs1(g)}% ${down ? 'kam' : 'zyada'}** hain (${money(a.rev)} vs ${money(b.rev)}). Wajah: ${reasons.join('; ')}.`,
      ) + ctxLine,
    blocks: [{ type: 'bars', fmt: 'money', items: M.byDow.map((x) => ({ label: x.short, v: x.avg })), hot: M.byDow.indexOf(day) }],
    spot: monthly ? 'earnings' : 'earningsToday',
    say: down ? 'why-down' : 'why-up',
  }
}

/* ------------------------------------------------------------------
   "What if" maths the built-in engine can do exactly:
   "har din $50 zyada", "sales 10% badh jaye", "har booking $10 mehngi"
   ------------------------------------------------------------------ */
function whatIfAnswer(q, ctx, lang) {
  const { M } = ctx
  const t = M.T.month
  const dim = new Date(M.today.getFullYear(), M.today.getMonth() + 1, 0).getDate()
  const left = dim - M.today.getDate()
  const perDay = t.rev / t.days
  const pace = perDay * dim
  const less = has(q, 'kam\\b|less|fewer|ghat|minus|drop|gir|lose|loss|neeche')
  const sign = less ? -1 : 1
  const pctHit = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent|fisad|pratishat)/)
  const amtHit = q.match(/\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:\$|dollars?|usd|bucks)/)
  const amt = amtHit ? Number((amtHit[1] ?? amtHit[2]).replace(/,/g, '')) : null
  const vsTarget = (v) =>
    v >= M.target
      ? pick(lang, ` That clears your ${money(M.target, 0)} target.`, ` Ye ${money(M.target, 0)} ka target paar kar leta hai.`)
      : pick(lang, ` That's ${money(M.target - v, 0)} short of the ${money(M.target, 0)} target.`, ` Target ${money(M.target, 0)} se ${money(M.target - v, 0)} kam rahega.`)
  const bars = (v) => ({
    type: 'bars',
    fmt: 'money',
    wide: true,
    hot: 1,
    items: [
      { label: pick(lang, 'Current pace', 'Abhi ki speed'), v: pace },
      { label: pick(lang, 'What if', 'Agar aisa ho'), v: Math.max(0, v) },
    ],
  })

  if (pctHit && !amt) {
    const p = Number(pctHit[1])
    const v = pace * (1 + (sign * p) / 100)
    return {
      text:
        pick(
          lang,
          `At today's pace the month ends near **${money(pace, 0)}**. ${less ? 'Down' : 'Up'} ${p}%: ${money(pace, 0)} × ${(1 + (sign * p) / 100).toFixed(2)} = **${money(v, 0)}**.`,
          `Abhi ki speed se mahina **${money(pace, 0)}** pe khatam hoga. ${p}% ${less ? 'kam' : 'zyada'} ho to ${money(pace, 0)} × ${(1 + (sign * p) / 100).toFixed(2)} = **${money(v, 0)}**.`,
        ) + vsTarget(v),
      blocks: [bars(v)],
      spot: 'earnings',
      say: v >= M.target ? 'whatif-clears' : 'whatif-short',
    }
  }
  if (amt != null && has(q, 'har din|roz|daily|every day|each day|per day|a day|rozana|din ka|din mein')) {
    const extra = amt * left
    const v = pace + sign * extra
    return {
      text:
        pick(
          lang,
          `${left} days are left, so ${left} × ${money(amt, 0)} = **${money(extra, 0)}** ${less ? 'less' : 'more'}. At today's pace you'd end near ${money(pace, 0)}, so now **${money(v, 0)}**.`,
          `Mahine mein **${left} din** bache hain, to ${left} × ${money(amt, 0)} = **${money(extra, 0)}** ${less ? 'kam' : 'zyada'}. Abhi ki speed se ${money(pace, 0)} banta, ab **${money(v, 0)}** hoga.`,
        ) + vsTarget(v),
      blocks: [bars(v)],
      spot: 'earnings',
      say: v >= M.target ? 'whatif-clears' : 'whatif-short',
    }
  }
  if (amt != null && has(q, 'har booking|per booking|each booking|every booking|booking pe|ticket')) {
    const projected = (t.orders / t.days) * dim
    const extra = amt * projected
    const v = pace + sign * extra
    return {
      text:
        pick(
          lang,
          `You're on track for about **${Math.round(projected)} bookings** this month, so ${Math.round(projected)} × ${money(amt, 0)} = **${money(extra, 0)}** ${less ? 'less' : 'more'}, ending near **${money(v, 0)}**.`,
          `Is mahine taqreeban **${Math.round(projected)} bookings** hongi, to ${Math.round(projected)} × ${money(amt, 0)} = **${money(extra, 0)}** ${less ? 'kam' : 'zyada'}. Mahina **${money(v, 0)}** ke aas paas khatam hoga.`,
        ) + vsTarget(v),
      blocks: [bars(v)],
      spot: 'earnings',
      say: v >= M.target ? 'whatif-clears' : 'whatif-short',
    }
  }
  return null
}

/** How Estaro's face reacts to an answer: good news smiles, bad news worries. */
export const moodFor = (ans) => {
  if (ans.action?.type === 'theme') return 'wink'
  if (ans.intent === 'unknown') return 'confused'
  if (ans.intent === 'worst' || /-(down|behind|short)$|^spend-more$/.test(ans.say ?? '')) return 'concerned'
  if (ans.say === 'target-hit' || ans.say === 'whatif-clears') return 'excited'
  const b = ans.blocks?.find((x) => x.delta != null)
  if (!b) return 'happy'
  const good = b.invert ? b.delta <= 0 : b.delta >= 0
  if (!good) return 'concerned'
  return Math.abs(b.delta) >= 15 ? 'excited' : 'happy'
}

/* ------------------------------------------------------------------
   Router
   ------------------------------------------------------------------ */
export function localAnswer(raw, ctx, memory = {}) {
  const lang = REPLY_LANG === 'auto' ? detectLang(raw) : REPLY_LANG
  const q = norm(raw)
  const { M, clients } = ctx
  const pers = detectPeriods(q, M.today)
  const per = pers[0] ?? null

  /* ---- actions ---- */
  const themeVerb = has(q, 'mode|theme|on\\b|karo|kar do|kardo|krdo|switch|enable|chalu|lagao|turn|set|kr do|activate')
  if (has(q, 'dark|night|kaala|kala|andher') && themeVerb)
    return { lang, text: pick(lang, 'Dark mode on. Easy on the eyes.', 'Dark mode on kar diya.'), action: { type: 'theme', value: 'dark' }, say: 'theme-dark' }
  if (has(q, 'light|day mode|white|roshni|safed') && themeVerb)
    return { lang, text: pick(lang, 'Light mode on.', 'Light mode on kar diya.'), action: { type: 'theme', value: 'light' }, say: 'theme-light' }

  const navVerb = has(q, 'open|go to|goto|take me|navigate|kholo|khol|le chalo|le jao|jao|chalo|page|dikhao page|switch to')
  if (navVerb) {
    const page = PAGES.find((p) => word(q, p.words))
    if (page && (has(q, 'page|open|kholo|khol|go to|goto|take me|navigate|le chalo|le jao') || q.split(' ').length <= 3)) {
      return {
        lang,
        text: pick(lang, `Opening **${PAGE_NAME[page.id][0]}**.`, `**${PAGE_NAME[page.id][1]}** khol diya.`),
        action: { type: 'go', view: page.id },
        say: `open-${page.id}`,
      }
    }
  }

  /* ---- a client by name ---- */
  const client = clients.find((c) => {
    const [first, last] = c.name.toLowerCase().split(' ')
    return word(q, `${first} ${last}`) || (first.length > 3 && word(q, first) && !has(q, V.properties))
  })
  if (client && !has(q, V.best)) return { lang, ...clientAnswer(client, lang), intent: 'client' }

  /* ---- a property by name ---- */
  if (M.properties.some((p) => q.includes(p.name.toLowerCase()))) return { lang, ...propertiesAnswer(q, ctx, lang), intent: 'property' }

  const metrics = []
  if (has(q, V.users)) metrics.push('users')
  if (has(q, V.sales)) metrics.push('sales')
  if (has(q, V.profit)) metrics.push('profit')
  if (has(q, V.expenses)) metrics.push('expenses')
  if (has(q, V.orders) && !has(q, 'bookingcom')) metrics.push('orders')
  if (has(q, V.visitors)) metrics.push('visitors')
  if (has(q, V.balance)) metrics.push('balance')
  if (has(q, V.transfers)) metrics.push('transfers')
  if (has(q, V.properties)) metrics.push('properties')
  if (has(q, V.channels)) metrics.push('channels')
  if (has(q, V.schedule)) metrics.push('schedule')
  // "airbnb se kitni bookings" is a question about the channel, not all bookings
  if (namedChannel(q, M)) metrics.splice(0, metrics.length, 'channels')

  /* ---- who Estaro is, small talk, greetings, help (only when nothing else was asked) ---- */
  if (!metrics.length && !per) {
    if (has(q, 'your name|ur name|who are you|who r u|what are you|introduce yourself|tumhara naam|tumhara nam|aapka naam|apka naam|apka nam|tera naam|naam kya|kaun ho|kon ho'))
      return {
        lang,
        text: pick(
          lang,
          'My name is **Estaro**, and I am your dashboard AI.',
          'Mera naam **Estaro** hai, aur main aapka dashboard AI hoon.',
        ),
        suggest: pick(lang, ['Give me a summary', 'What can you do?'], ['Summary do', 'Tum kya kar sakte ho?']),
        intent: 'identity',
        say: 'identity',
      }
    if (has(q, 'how are you|how r u|how are u|hows it going|how is it going|kaise ho|kese ho|kaisay ho|kya haal|kia haal|kaisi ho'))
      return {
        lang,
        text: pick(lang, "I'm doing great, thanks for asking! Ready to dig into your numbers whenever you are.", 'Main bilkul theek hoon, poochne ka shukriya! Jab chaho numbers dekhte hain.'),
        suggest: pick(lang, ['How much did we sell this month?', 'Am I on target?'], ['Is mahine kitni sales hui?', 'Target kitna hua?']),
        intent: 'smalltalk',
        say: 'howareyou',
      }
    if (has(q, 'hi\\b|hello|hey|salam|assalam|aoa\\b|hola|namaste|adaab|yo\\b|sup\\b'))
      return {
        lang,
        text: pick(
          lang,
          `Hey ${ctx.admin.first}! I'm Estaro. I know every number on this dashboard. Ask me about sales, users, profit, balance or properties.`,
          `Salam ${ctx.admin.first}! Main Estaro hoon. Is dashboard ka har number mujhe pata hai. Sales, users, profit, balance ya properties, kuch bhi poochiye.`,
        ),
        suggest: pick(lang, ['How much did we sell this month?', 'How many users do we have?'], ['Is mahine kitni sales hui?', 'Total kitne users hain?']),
        intent: 'greeting',
        say: 'greeting',
      }
    if (has(q, 'thank|thanks|thx|shukri|jazak|great|awesome|nice|zabardast|kamaal|perfect|wah'))
      return { lang, text: pick(lang, 'Anytime! Ask me anything else.', 'Koi baat nahi! Aur kuch poochna ho to batao.'), intent: 'thanks', say: 'thanks' }
    if (has(q, 'help|what can you|kya kar sakt|kya kya|madad|commands|features|how to use'))
      return {
        lang,
        text: pick(
          lang,
          'I read the live dashboard data on this device, with no internet or API key. Try: sales today, new users this week, profit last month, top clients, best day, target progress, what-ifs like "what if we earn $50 more a day", or "turn on dark mode".',
          'Main is device par hi dashboard ka live data padhta hoon, bina internet aur bina API key ke. Try karo: aaj ki sales, is hafte naye users, pichle mahine ka munafa, top clients, best din, target, mahino ka comparison, ya "dark mode on karo".',
        ),
        suggest: pick(lang, ['Give me a summary', 'Compare this month vs last month'], ['Sab kuch summary mein batao', 'Is mahine aur pichle mahine ka comparison']),
        intent: 'help',
        say: 'help',
      }
  }

  /* ---- "why are sales down?" has a real answer in the data ---- */
  if (has(q, 'why\\b|kyun|kyon|kyu\\b|wajah|reason') && (has(q, V.sales) || has(q, 'kam|down|drop|gir|zyada|up\\b|badh|barh')))
    return { lang, ...whyAnswer(q, ctx, lang), intent: 'why' }

  /* ---- writing, advice and other "why" questions are outside what Estaro does ---- */
  if (has(q, 'write|likho|likh do|likhdo|draft|compose|motivat|caption|poem|shayari|slogan|email|tips?\\b|advice|mashwar|salah|suggest|ideas?\\b|why\\b|kyun|kyon|kyu\\b|explain|samjhao|improve|strategy|plan\\b'))
    return {
      lang,
      intent: 'unknown',
      text: pick(
        lang,
        "That one's outside what I can do. I answer from your dashboard numbers: sales, profit, users, balance, properties, clients and your schedule.",
        'Ye mere bas ki baat nahi. Main dashboard ke numbers se jawab deta hoon: sales, munafa, users, balance, properties, clients aur schedule.',
      ),
      suggest: pick(lang, ['Give me a summary'], ['Summary do']),
      say: 'needs-model',
    }

  /* ---- "what if" maths Estaro can do exactly; anything else gets examples ---- */
  const hypothetical = has(q, 'agar|what if|if we|if i|if sales|if each|if every|suppose|assume|farz|maan lo|man lo')
  if (hypothetical) {
    const w = whatIfAnswer(q, ctx, lang)
    if (w) return { lang, ...w, intent: 'whatif' }
  }
  if (hypothetical && metrics.length)
    return {
      lang,
      intent: 'unknown',
      text: pick(
        lang,
        'I can run what-ifs like "what if sales grow 10%", "what if we earn $50 more a day" or "what if each booking costs $10 more". Try one of those.',
        'Main aise "agar" wale sawal hal kar sakta hoon: "agar sales 10% badh jaye", "agar har din $50 zyada kamaye" ya "har booking $10 mehngi ho to". Inmein se koi try karo.',
      ),
      suggest: pick(lang, ['Am I on target?'], ['Target kitna hua?']),
      say: 'whatif-model',
    }

  /* ---- composite intents ---- */
  if (has(q, V.summary) && metrics.length <= 1) return { lang, ...summaryAnswer(ctx, lang), intent: 'summary' }
  if (has(q, V.target)) return { lang, ...targetAnswer(ctx, lang), intent: 'target' }
  if (has(q, V.compare) || pers.length >= 2) return { lang, ...compareAnswer(q, pers, ctx, lang), intent: 'compare' }
  if (has(q, V.worst)) return { lang, ...bestAnswer(q, ctx, lang, 'worst'), intent: 'worst' }
  if (has(q, V.best)) return { lang, ...bestAnswer(q, ctx, lang, 'best'), intent: 'best' }

  /* ---- follow-up: "aur pichle mahine?" reuses the last metric ---- */
  if (!metrics.length && per && memory.metric) metrics.push(memory.metric)
  if (!metrics.length && has(q, 'kitn|how much|how many|kitt')) metrics.push(memory.metric ?? 'sales')
  if (!metrics.length) {
    return {
      lang,
      text: pick(
        lang,
        "I didn't catch that one. I can answer anything about sales, profit, expenses, users, balance, transfers, properties, channels or your schedule.",
        'Ye wala samajh nahi aaya. Main sales, munafa, kharcha, users, balance, transfers, properties, channels ya schedule ke baare mein bata sakta hoon.',
      ),
      suggest: pick(lang, ['Give me a summary', 'Sales today', 'How many users?'], ['Summary do', 'Aaj ki sales kitni hai?', 'Kitne users hain?']),
      intent: 'unknown',
      say: 'unknown',
    }
  }

  const t = per ? resolve(per, ctx) : null
  const parts = metrics.slice(0, 3).map((m) => {
    switch (m) {
      case 'users':
        return usersAnswer(q, per, ctx, lang)
      case 'profit':
        return profitAnswer(t ?? M.T.month, ctx, lang)
      case 'expenses':
        return expensesAnswer(t ?? M.T.month, ctx, lang)
      case 'orders':
        return ordersAnswer(t ?? M.T.month, ctx, lang)
      case 'visitors':
        return visitorsAnswer(t ?? M.T.month, ctx, lang)
      case 'balance':
        return balanceAnswer(ctx, lang)
      case 'transfers':
        return transfersAnswer(ctx, lang)
      case 'properties':
        return propertiesAnswer(q, ctx, lang)
      case 'channels':
        return channelsAnswer(q, ctx, lang)
      case 'schedule':
        return scheduleAnswer(q, ctx, lang)
      default:
        return salesAnswer(t ?? M.T.month, ctx, lang)
    }
  })
  return {
    lang,
    intent: metrics[0],
    metric: metrics[0],
    text: parts.map((p) => p.text).join('\n\n'),
    blocks: parts.flatMap((p) => p.blocks ?? []).slice(0, 4),
    spot: parts[0].spot ?? null,
    say: parts[0].say,
    suggest: parts[parts.length - 1].suggest,
  }
}
