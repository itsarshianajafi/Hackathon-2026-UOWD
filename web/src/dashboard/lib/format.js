export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const money = (n, dp = 2, symbol = '$') => {
  const sign = n < 0 ? '-' : ''
  return (
    sign +
    symbol +
    Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  )
}

export const whole = (n) => money(n, 0)

export const compact = (n, symbol = '$') => {
  const a = Math.abs(n)
  if (a >= 1e6) return `${symbol}${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`
  if (a >= 1e3) return `${symbol}${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return `${symbol}${Math.round(n)}`
}

export const num = (n) => Math.round(n).toLocaleString('en-US')

export const pct = (n, dp = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`

const two = (n) => String(n).padStart(2, '0')

export const clock24 = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`

export const clock = (d) => {
  const h = d.getHours() % 12 || 12
  return `${h}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

export const isoDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

export const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "Today, 14:34" / "Yesterday, 09:10" / "12 Oct, 18:02" — the transfer list format. */
export const relDay = (d, now = new Date()) => {
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 864e5)
  if (diff === 0) return `Today, ${clock24(d)}`
  if (diff === 1) return `Yesterday, ${clock24(d)}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock24(d)}`
}

export const ago = (d, now = new Date()) => {
  const s = Math.max(0, Math.round((now - d) / 1000))
  if (s < 45) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const dd = Math.round(h / 24)
  return dd === 1 ? 'Yesterday' : `${dd} days ago`
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Deterministic PRNG so the demo data is identical on every load. */
export const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
