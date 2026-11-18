/* ------------------------------------------------------------------
   Every number on the dashboard is derived here from the raw daily
   rows, so the cards, the analytics page and the AI assistant can
   never disagree with each other.
   ------------------------------------------------------------------ */
import { addDays, DAYS_LONG, MONTHS, MONTHS_LONG } from './format'
import { ACTIVE_RATIO, BASE_USERS, CHANNELS, PROPERTIES, dayProgress } from '../data/seed'

const ZERO = { rev: 0, exp: 0, orders: 0, signups: 0, visitors: 0 }

const add = (a, r) => ({
  rev: a.rev + r.rev,
  exp: a.exp + r.exp,
  orders: a.orders + r.orders,
  signups: a.signups + r.signups,
  visitors: a.visitors + r.visitors,
})

export const pctChange = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : 0)

/** Sum of the rows in [start, end). */
export function totals(daily, start, end) {
  const rows = daily.filter((r) => r.date >= start && r.date < end)
  const t = rows.reduce(add, ZERO)
  return {
    ...t,
    profit: t.rev - t.exp,
    margin: t.rev ? ((t.rev - t.exp) / t.rev) * 100 : 0,
    ticket: t.orders ? t.rev / t.orders : 0,
    conversion: t.visitors ? (t.orders / t.visitors) * 100 : 0,
    days: rows.length,
    rows,
    start,
    end,
  }
}

const monthStart = (y, m) => new Date(y, m, 1)

/** Named periods the UI and the assistant both understand. */
export function periods(today) {
  const tomorrow = addDays(today, 1)
  const dow = (today.getDay() + 6) % 7 // Monday = 0
  const monday = addDays(today, -dow)
  const mStart = monthStart(today.getFullYear(), today.getMonth())
  const lmStart = monthStart(today.getFullYear(), today.getMonth() - 1)
  const lmSameEnd = new Date(Math.min(addDays(lmStart, today.getDate()).getTime(), mStart.getTime()))
  const yStart = new Date(today.getFullYear(), 0, 1)
  const lyStart = new Date(today.getFullYear() - 1, 0, 1)
  const lySameEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1)
  return {
    today: { start: today, end: tomorrow, en: 'today', ur: 'aaj' },
    yesterday: { start: addDays(today, -1), end: today, en: 'yesterday', ur: 'kal' },
    week: { start: monday, end: tomorrow, en: 'this week', ur: 'is hafte' },
    lastWeek: { start: addDays(monday, -7), end: monday, en: 'last week', ur: 'pichle hafte' },
    lastWeekSame: { start: addDays(monday, -7), end: addDays(tomorrow, -7), en: 'the same days last week', ur: 'pichle hafte isi waqt tak' },
    last7: { start: addDays(today, -6), end: tomorrow, en: 'in the last 7 days', ur: 'pichle 7 din mein' },
    last30: { start: addDays(today, -29), end: tomorrow, en: 'in the last 30 days', ur: 'pichle 30 din mein' },
    month: { start: mStart, end: tomorrow, en: 'this month', ur: 'is mahine' },
    lastMonth: { start: lmStart, end: mStart, en: 'last month', ur: 'pichle mahine' },
    lastMonthSame: { start: lmStart, end: lmSameEnd, en: 'the same point last month', ur: 'pichle mahine isi waqt tak' },
    year: { start: yStart, end: tomorrow, en: 'this year', ur: 'is saal' },
    lastYear: { start: lyStart, end: yStart, en: 'last year', ur: 'pichle saal' },
    lastYearSame: { start: lyStart, end: lySameEnd, en: 'the same point last year', ur: 'pichle saal isi waqt tak' },
    all: { start: new Date(0), end: tomorrow, en: 'all time', ur: 'ab tak total' },
  }
}

/** Calendar month m (0–11) of year y as a period; falls back a year if it is still in the future. */
export function monthPeriod(today, m, y) {
  let year = y ?? today.getFullYear()
  if (y == null && m > today.getMonth()) year -= 1
  const start = monthStart(year, m)
  const end = new Date(Math.min(monthStart(year, m + 1).getTime(), addDays(today, 1).getTime()))
  return { start, end, en: `in ${MONTHS_LONG[m]} ${year}`, ur: `${MONTHS_LONG[m]} ${year} mein` }
}

/** Resample a series to `n` points (linear), used for the chart morphs. */
export function resample(values, n) {
  if (values.length === n) return values.slice()
  if (values.length === 1) return Array(n).fill(values[0])
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (values.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(values.length - 1, lo + 1)
    return values[lo] + (values[hi] - values[lo]) * (t - lo)
  })
}

export function buildMetrics(daily, clients, { target, clientDelta = 0, liveBoost = 0 } = {}) {
  const today = daily[daily.length - 1].date
  const P = periods(today)
  const T = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, { ...totals(daily, p.start, p.end), ...p, key: k }]))

  // "same point last week/month/year" ends on a full day while today is still running,
  // so only count the same share of that last day
  const left = 1 - dayProgress()
  const trim = (t, extra = {}) => {
    const last = t.rows[t.rows.length - 1]
    if (!last) return { ...t, ...extra }
    const rev = t.rev - last.rev * left
    const exp = t.exp - last.exp * left
    const orders = t.orders - Math.round(last.orders * left)
    const visitors = t.visitors - Math.round(last.visitors * left)
    return {
      ...t,
      ...extra,
      rev,
      exp,
      orders,
      visitors,
      signups: t.signups - Math.round(last.signups * left),
      profit: rev - exp,
      margin: rev ? ((rev - exp) / rev) * 100 : 0,
      ticket: orders ? rev / orders : 0,
      conversion: visitors ? (orders / visitors) * 100 : 0,
    }
  }
  T.lastWeekSame = trim(T.lastWeekSame)
  T.lastMonthSame = trim(T.lastMonthSame)
  T.lastYearSame = trim(T.lastYearSame)
  T.yesterdaySame = trim(T.yesterday, { key: 'yesterdaySame', en: 'this time yesterday', ur: 'kal isi waqt tak' })

  /* ---------- users ---------- */
  const signedUp = T.all.signups + clientDelta
  const totalUsers = BASE_USERS + signedUp
  const activeUsers = Math.round(totalUsers * ACTIVE_RATIO)
  const newUsers = {
    today: T.today.signups + clientDelta,
    week: T.week.signups + clientDelta,
    month: T.month.signups + clientDelta,
    lastMonth: T.lastMonth.signups,
    lastMonthSame: T.lastMonthSame.signups,
    year: T.year.signups + clientDelta,
  }

  /* ---------- months (last 12 incl. the current one) ---------- */
  const months = []
  for (let k = 11; k >= 0; k--) {
    const y = today.getFullYear()
    const m = today.getMonth() - k
    const start = monthStart(y, m)
    const end = monthStart(y, m + 1)
    const t = totals(daily, start, end)
    months.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: MONTHS[start.getMonth()],
      long: `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`,
      month: start.getMonth(),
      year: start.getFullYear(),
      partial: k === 0,
      rev: t.rev,
      exp: t.exp,
      profit: t.profit,
      orders: t.orders,
      signups: t.signups,
      endBalance: t.rows.length ? t.rows[t.rows.length - 1].balance : 0,
    })
  }
  const full = months.filter((m) => !m.partial)
  const bestMonth = full.reduce((a, b) => (b.rev > a.rev ? b : a), full[0])
  const worstMonth = full.reduce((a, b) => (b.rev < a.rev ? b : a), full[0])

  /* ---------- weekday pattern over the last 12 weeks ---------- */
  const recent = daily.slice(-85, -1)
  const byDow = Array.from({ length: 7 }, (_, d) => {
    const rows = recent.filter((r) => r.date.getDay() === d)
    return { day: DAYS_LONG[d], short: DAYS_LONG[d].slice(0, 3), avg: rows.reduce((s, r) => s + r.rev, 0) / (rows.length || 1) }
  })
  const dowAvg = byDow.reduce((s, d) => s + d.avg, 0) / 7
  const bestDow = byDow.reduce((a, b) => (b.avg > a.avg ? b : a))
  const worstDow = byDow.reduce((a, b) => (b.avg < a.avg ? b : a))

  /* ---------- best single day in the last 30 ---------- */
  const last30 = daily.slice(-30)
  const bestDay = last30.reduce((a, b) => (b.rev > a.rev ? b : a))

  /* ---------- properties & channels (split of this month's revenue) ---------- */
  const wiggle = (i) => 0.9 + ((i * 37) % 21) / 100
  const rawProps = PROPERTIES.map((p, i) => ({ ...p, rev: T.month.rev * p.weight * wiggle(i) }))
  const propScale = T.month.rev / rawProps.reduce((s, p) => s + p.rev, 0)
  const properties = rawProps
    .map((p) => ({ ...p, rev: p.rev * propScale, occupancy: (p.occupied / p.units) * 100 }))
    .sort((a, b) => b.rev - a.rev)
  const channels = CHANNELS.map((c) => ({ ...c, rev: T.month.rev * c.share, orders: Math.round(T.month.orders * c.share) }))

  /* ---------- clients ---------- */
  const topClients = [...clients].sort((a, b) => b.spent - a.spent).slice(0, 5)
  const byStatus = clients.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {})

  /* ---------- balance ---------- */
  const balance = daily[daily.length - 1].balance + liveBoost
  const balanceSeries = {
    weekly: [...daily.slice(-7).map((r) => r.balance)],
    monthly: daily.slice(-30).map((r) => r.balance),
    yearly: months.map((m) => m.endBalance),
  }
  balanceSeries.weekly[balanceSeries.weekly.length - 1] += liveBoost
  balanceSeries.monthly[balanceSeries.monthly.length - 1] += liveBoost
  balanceSeries.yearly[balanceSeries.yearly.length - 1] += liveBoost

  const occupancy =
    (PROPERTIES.reduce((s, p) => s + p.occupied, 0) / PROPERTIES.reduce((s, p) => s + p.units, 0)) * 100

  return {
    today,
    P,
    T,
    totalUsers,
    activeUsers,
    newUsers,
    months,
    bestMonth,
    worstMonth,
    byDow,
    dowAvg,
    bestDow,
    worstDow,
    bestDay,
    properties,
    channels,
    topClients,
    byStatus,
    clientCount: clients.length,
    balance,
    balanceSeries,
    occupancy,
    target,
    targetPct: (T.month.rev / target) * 100,
    growth: {
      revMonth: pctChange(T.month.rev, T.lastMonthSame.rev),
      profitMonth: pctChange(T.month.profit, T.lastMonthSame.profit),
      expMonth: pctChange(T.month.exp, T.lastMonthSame.exp),
      usersMonth: pctChange(newUsers.month, newUsers.lastMonthSame),
      revToday: pctChange(T.today.rev, T.yesterdaySame.rev),
      profitToday: pctChange(T.today.profit, T.yesterdaySame.profit),
      revWeek: pctChange(T.week.rev, T.lastWeekSame.rev),
      revYear: pctChange(T.year.rev, T.lastYearSame.rev),
    },
  }
}

/** The headline insights — shown on the Insights card and offered by the assistant. */
export function insights(M) {
  const up = M.growth.revMonth >= 0
  const top = M.properties[0]
  const low = [...M.properties].sort((a, b) => a.occupancy - b.occupancy)[0]
  const share = (top.rev / M.T.month.rev) * 100
  const dowLift = ((M.bestDow.avg - M.dowAvg) / M.dowAvg) * 100
  return [
    {
      icon: 'trend',
      en: `Sales are ${up ? 'up' : 'down'} ${Math.abs(M.growth.revMonth).toFixed(1)}% vs the same point last month.`,
      ur: `Sales pichle mahine ke muqable ${Math.abs(M.growth.revMonth).toFixed(1)}% ${up ? 'zyada' : 'kam'} hain.`,
      spot: 'earnings',
    },
    {
      icon: 'calendar',
      en: `${M.bestDow.day} is your best day, ${dowLift.toFixed(0)}% above an average day.`,
      ur: `${M.bestDow.day} aapka sabse best din hai, average se ${dowLift.toFixed(0)}% zyada sales.`,
      spot: 'activity',
    },
    {
      icon: 'building',
      en: `${top.name} brings in ${share.toFixed(0)}% of this month's revenue.`,
      ur: `${top.name} is mahine ki ${share.toFixed(0)}% kamai la rahi hai.`,
      spot: null,
    },
    {
      icon: 'users',
      en: `${M.newUsers.month.toLocaleString('en-US')} new clients joined this month. ${M.byStatus.Pending ?? 0} are still pending.`,
      ur: `Is mahine ${M.newUsers.month.toLocaleString('en-US')} naye clients aaye. ${M.byStatus.Pending ?? 0} abhi pending hain.`,
      spot: 'clients',
    },
    {
      icon: 'alert',
      en: `${low.name} is only ${low.occupancy.toFixed(0)}% occupied. A promo could fill it.`,
      ur: `${low.name} sirf ${low.occupancy.toFixed(0)}% bhari hai. Ek offer chala ke bhar sakte hain.`,
      spot: null,
    },
  ]
}
