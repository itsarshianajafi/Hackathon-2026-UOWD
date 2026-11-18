/* ------------------------------------------------------------------
   Demo data. Everything is generated from a fixed seed and anchored
   to today's date, so "today", "this month" and "last month" always
   mean something — and the AI and the cards read the same numbers.
   ------------------------------------------------------------------ */
import { addDays, mulberry32, startOfDay } from '../lib/format'

export const PERSONAS = {
  investor: { first: 'Layla', name: 'Layla Al Mansoori', email: 'layla.almansoori@example.com', role: 'Investor' },
  buyer: { first: 'Omar', name: 'Omar Al Hashimi', email: 'omar.alhashimi@example.com', role: 'Buyer' },
}

/** Users who signed up before the generated history starts. */
export const BASE_USERS = 2148
export const ACTIVE_RATIO = 0.642

export const DEFAULT_TARGET = 21000

const HISTORY = 730
const WEEKDAY = [1.16, 0.86, 0.84, 0.9, 0.97, 1.12, 1.27]
const SEASON = [0.88, 0.9, 0.96, 1.0, 1.05, 1.12, 1.18, 1.15, 1.0, 1.08, 1.02, 1.12]

/** How far through a trading day (6am–10pm) we are, floored so mornings are not empty. */
export const dayProgress = (now = new Date()) => Math.min(1, Math.max(0.32, (now.getHours() + now.getMinutes() / 60 - 6) / 16))

/** Two years of daily trading, ending today (today is only partly through). */
export function makeDaily(now = new Date()) {
  const rnd = mulberry32(1407)
  const today = startOfDay(now)
  const start = addDays(today, -(HISTORY - 1))
  const dayFrac = dayProgress(now)
  let balance = 16840
  const rows = []
  for (let i = 0; i < HISTORY; i++) {
    const date = addDays(start, i)
    const trend = 0.78 + (i / HISTORY) * 0.36
    const noise = 0.82 + rnd() * 0.36
    let rev = 640 * trend * WEEKDAY[date.getDay()] * SEASON[date.getMonth()] * noise
    let exp = rev * (0.49 + rnd() * 0.13) + 38
    let orders = Math.max(1, Math.round(rev / (76 + rnd() * 20)))
    let signups = Math.max(2, Math.round((7 + trend * 4) * (date.getDay() % 6 === 0 ? 1.25 : 1) * (0.7 + rnd() * 0.6)))
    let visitors = Math.round(orders * (27 + rnd() * 14))
    if (i === HISTORY - 1) {
      rev *= dayFrac
      exp *= dayFrac
      orders = Math.max(1, Math.round(orders * dayFrac))
      signups = Math.max(1, Math.round(signups * dayFrac))
      visitors = Math.round(visitors * dayFrac)
    }
    rev = Math.round(rev * 100) / 100
    exp = Math.round(exp * 100) / 100
    balance += rev - exp
    // owner payouts and quarterly tax keep the balance curve honest
    if (date.getDate() === 1) balance -= 3100 + rnd() * 600
    if (date.getDate() === 15) balance -= 1400 + rnd() * 500
    if (date.getDate() === 20 && date.getMonth() % 3 === 0) balance -= 1900
    rows.push({ date, rev, exp, orders, signups, visitors, balance: Math.round(balance * 100) / 100 })
  }
  return rows
}

export const PROPERTIES = [
  { id: 'p1', name: 'Ocean View Loft', city: 'Lisbon', units: 12, occupied: 11, weight: 0.21, rating: 4.9, hue: 152 },
  { id: 'p2', name: 'Maple Court', city: 'Toronto', units: 24, occupied: 19, weight: 0.17, rating: 4.7, hue: 28 },
  { id: 'p3', name: 'Cedar Heights', city: 'Denver', units: 18, occupied: 16, weight: 0.15, rating: 4.8, hue: 200 },
  { id: 'p4', name: 'Palm Residency', city: 'Dubai', units: 30, occupied: 22, weight: 0.14, rating: 4.6, hue: 40 },
  { id: 'p5', name: 'Linden House', city: 'Berlin', units: 10, occupied: 9, weight: 0.11, rating: 4.8, hue: 270 },
  { id: 'p6', name: 'Harbor Point', city: 'Sydney', units: 16, occupied: 12, weight: 0.09, rating: 4.5, hue: 190 },
  { id: 'p7', name: 'Olive Gardens', city: 'Athens', units: 14, occupied: 10, weight: 0.08, rating: 4.4, hue: 95 },
  { id: 'p8', name: 'Birch Studios', city: 'Oslo', units: 8, occupied: 5, weight: 0.05, rating: 4.3, hue: 330 },
]

/** Who a simulated live booking comes from. */
export const LIVE_GUESTS = ['Airbnb guest', 'Booking.com guest', 'Direct booking', 'Referral guest']

export const CHANNELS = [
  { id: 'direct', name: 'Direct', share: 0.38 },
  { id: 'airbnb', name: 'Airbnb', share: 0.29 },
  { id: 'booking', name: 'Booking.com', share: 0.21 },
  { id: 'referral', name: 'Referral', share: 0.12 },
]

const FIRST = [
  'Anna', 'Carlos', 'Joel', 'Maya', 'Liam', 'Sofia', 'Noah', 'Aisha', 'Ethan', 'Zara', 'Lucas', 'Hana', 'Omar', 'Chloe',
  'Ravi', 'Emma', 'Yusuf', 'Isla', 'Mateo', 'Leah', 'Kenji', 'Nora', 'Daniel', 'Amira', 'Felix', 'Priya', 'Hugo', 'Sara',
  'Ivan', 'Mila', 'Adam', 'Lina', 'Theo', 'Fatima', 'Leo', 'Grace', 'Ali', 'Elena', 'Sam', 'Ines',
]
const LAST = [
  'Jones', 'Brown', 'Cannan', 'Patel', 'Walker', 'Rossi', 'Kim', 'Khan', 'Moore', 'Ahmed', 'Silva', 'Sato', 'Haddad',
  'Martin', 'Mehta', 'Wilson', 'Demir', 'Clarke', 'Garcia', 'Cohen', 'Tanaka', 'Berg', 'Evans', 'Nasser', 'Weber',
  'Sharma', 'Laurent', 'Novak', 'Petrov', 'Horvat', 'Fischer', 'Saleh', 'Reid', 'Malik', 'Costa', 'Hill', 'Raza',
  'Ivanova', 'Taylor', 'Duarte',
]
const PLANS = ['Basic', 'Pro', 'Pro', 'Business']

export function makeClients(now = new Date()) {
  const rnd = mulberry32(88)
  const list = FIRST.map((first, i) => {
    const name = `${first} ${LAST[i]}`
    const daysAgo = Math.floor(Math.pow(rnd(), 1.6) * 58)
    const joined = new Date(now.getTime() - daysAgo * 864e5 - Math.floor(rnd() * 20) * 36e5)
    const roll = rnd()
    const status = roll < 0.68 ? 'Active' : roll < 0.86 ? 'Pending' : 'Inactive'
    const prop = PROPERTIES[Math.floor(rnd() * PROPERTIES.length)]
    return {
      id: `c${i + 1}`,
      name,
      email: `${first.toLowerCase()}.${LAST[i].toLowerCase()}@mail.com`,
      property: prop.name,
      plan: PLANS[Math.floor(rnd() * PLANS.length)],
      status,
      joined,
      spent: Math.round((400 + rnd() * 5200) * 100) / 100,
      hue: Math.floor(rnd() * 360),
    }
  })
  return list.sort((a, b) => b.joined - a.joined)
}

/** Recent money movements. `mins` is how long ago it happened. */
const TRANSFER_SEED = [
  { who: 'Anna Jones', dir: 'in', amount: 240.0, mins: 38, note: 'Booking · Ocean View Loft' },
  { who: 'Carlos Brown III', dir: 'out', amount: 120.5, mins: 95, note: 'Cleaning service' },
  { who: 'Joel Cannan', dir: 'in', amount: 312.75, mins: 210, note: 'Booking · Maple Court' },
  { who: 'Maya Patel', dir: 'in', amount: 189.0, mins: 420, note: 'Booking · Cedar Heights' },
  { who: 'Northwind Utilities', dir: 'out', amount: 264.3, mins: 980, note: 'Electricity · Palm Residency' },
  { who: 'Liam Walker', dir: 'in', amount: 455.0, mins: 1460, note: 'Booking · Linden House' },
  { who: 'FixIt Plumbing', dir: 'out', amount: 98.0, mins: 1820, note: 'Repair · Harbor Point' },
  { who: 'Sofia Rossi', dir: 'in', amount: 276.4, mins: 2900, note: 'Booking · Olive Gardens' },
  { who: 'Noah Kim', dir: 'in', amount: 132.0, mins: 3400, note: 'Booking · Birch Studios' },
  { who: 'City Council', dir: 'out', amount: 410.0, mins: 4300, note: 'Property tax' },
]

export function makeTransfers(now = new Date()) {
  return TRANSFER_SEED.map((t, i) => ({ id: `t${i + 1}`, ...t, at: new Date(now.getTime() - t.mins * 6e4) }))
}

export const CARDS = [
  { id: 'k1', skin: 'glass', holder: 'Lana Steiner', number: '1234 1234 1234 1234', exp: '06/28', brand: 'Master Card' },
  { id: 'k2', skin: 'sage', holder: 'Olivia Rhye', number: '1234 1234 1234 1234', exp: '09/27', brand: 'Master Card' },
  { id: 'k3', skin: 'onyx', holder: 'Phoenix Baker', number: '1234 1234 1234 1234', exp: '11/29', brand: 'Master Card' },
]

export function makeEvents(now = new Date()) {
  const d = (days, h, m = 0) => {
    const x = addDays(startOfDay(now), days)
    x.setHours(h, m)
    return x
  }
  return [
    { id: 'e1', at: d(0, 10), title: 'Viewing · Ocean View Loft', who: 'Anna Jones', kind: 'viewing' },
    { id: 'e2', at: d(0, 13, 30), title: 'Team stand-up', who: 'Ops team', kind: 'meeting' },
    { id: 'e3', at: d(0, 17), title: 'Boiler check · Maple Court', who: 'FixIt Plumbing', kind: 'maintenance' },
    { id: 'e4', at: d(1, 9, 30), title: 'Lease signing · Cedar Heights', who: 'Maya Patel', kind: 'viewing' },
    { id: 'e5', at: d(1, 15), title: 'Quarterly review', who: 'Finance', kind: 'meeting' },
    { id: 'e6', at: d(2, 11), title: 'Photo shoot · Linden House', who: 'Studio Nine', kind: 'meeting' },
    { id: 'e7', at: d(3, 14), title: 'Roof inspection · Harbor Point', who: 'Apex Roofing', kind: 'maintenance' },
    { id: 'e8', at: d(4, 10, 30), title: 'Viewing · Palm Residency', who: 'Omar Haddad', kind: 'viewing' },
    { id: 'e9', at: d(6, 12), title: 'Owners lunch', who: 'Partners', kind: 'meeting' },
  ]
}

export function makeNotifications(now = new Date()) {
  const m = (mins) => new Date(now.getTime() - mins * 6e4)
  return [
    { id: 'n1', icon: 'arrowDown', tone: 'green', title: 'Anna Jones paid $240.00', body: 'Booking · Ocean View Loft', at: m(38), unread: true },
    { id: 'n2', icon: 'users', tone: 'sage', title: '12 new clients today', body: 'Most came from Airbnb', at: m(70), unread: true },
    { id: 'n3', icon: 'shield', tone: 'amber', title: 'Security check due', body: 'Update your security password', at: m(180), unread: true },
    { id: 'n4', icon: 'arrowUpRight', tone: 'red', title: 'You sent $120.50', body: 'To Carlos Brown III', at: m(95), unread: false },
    { id: 'n5', icon: 'building', tone: 'sage', title: 'Birch Studios occupancy low', body: '5 of 8 units booked', at: m(600), unread: false },
  ]
}
