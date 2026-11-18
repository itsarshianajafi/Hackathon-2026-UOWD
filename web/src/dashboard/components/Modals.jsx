import { useState } from 'react'
import Icon from './Icon'
import { CreditCard } from './Cards'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { money, uid } from '../lib/format'
import { PROPERTIES } from '../data/seed'

const SKINS = ['glass', 'sage', 'onyx', 'sand', 'ocean']

const groupDigits = (v) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim()

export function AddCardModal({ open, onClose }) {
  const { setCards, toast, admin } = useApp()
  const [form, setForm] = useState({ holder: admin.name, number: '', exp: '', skin: 'sage' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const digits = form.number.replace(/\D/g, '')
  const valid = form.holder.trim() && digits.length === 16 && /^(0[1-9]|1[0-2])\/\d{2}$/.test(form.exp)

  const preview = {
    skin: form.skin,
    brand: 'Master Card',
    holder: form.holder || 'Card holder',
    number: groupDigits(form.number).padEnd(19, '•'),
    exp: form.exp || 'MM/YY',
  }

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    setCards((c) => [{ id: uid(), skin: form.skin, brand: 'Master Card', holder: form.holder.trim(), number: groupDigits(form.number), exp: form.exp }, ...c])
    toast('Card added', `Card ending ${digits.slice(-4)} is now in your wallet.`, { icon: 'idcard' })
    setForm({ holder: admin.name, number: '', exp: '', skin: 'sage' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a new card" sub="It joins the stack on your dashboard right away." width={460}>
      <form className="form" onSubmit={submit}>
        <div className="card-preview">
          <CreditCard c={preview} />
        </div>
        <div className="skins" role="radiogroup" aria-label="Card colour">
          {SKINS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={form.skin === s}
              aria-label={s}
              className={`skin ${s} ${form.skin === s ? 'on' : ''}`}
              onClick={() => setForm((f) => ({ ...f, skin: s }))}
            />
          ))}
        </div>
        <label className="field">
          <span>Card holder</span>
          <input value={form.holder} onChange={set('holder')} autoComplete="cc-name" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Card number</span>
            <input
              value={groupDigits(form.number)}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              inputMode="numeric"
              placeholder="1234 1234 1234 1234"
              autoComplete="cc-number"
            />
          </label>
          <label className="field">
            <span>Expiry</span>
            <input
              value={form.exp}
              onChange={(e) => {
                let v = e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`
                setForm((f) => ({ ...f, exp: v }))
              }}
              inputMode="numeric"
              placeholder="MM/YY"
              autoComplete="cc-exp"
            />
          </label>
        </div>
        <button type="submit" className="btn sage block" disabled={!valid}>
          <Icon name="plus" size={16} stroke={2.2} /> Add card
        </button>
      </form>
    </Modal>
  )
}

export function AddClientModal({ open, onClose }) {
  const { addClient } = useApp()
  const blank = { name: '', email: '', property: PROPERTIES[0].name, plan: 'Pro', status: 'Active' }
  const [form, setForm] = useState(blank)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const valid = form.name.trim().split(/\s+/).length >= 1 && form.name.trim().length > 1 && emailOk

  return (
    <Modal open={open} onClose={onClose} title="Add a client" sub="New clients count toward your users straight away. Ask Estaro!">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          addClient({ ...form, name: form.name.trim(), email: form.email.trim() })
          setForm(blank)
          onClose()
        }}
      >
        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Sara Malik" autoFocus />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} placeholder="name@mail.com" />
          {form.email && !emailOk ? <small className="err">That email doesn’t look right.</small> : null}
        </label>
        <label className="field">
          <span>Property</span>
          <select value={form.property} onChange={set('property')}>
            {PROPERTIES.map((p) => (
              <option key={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Plan</span>
            <select value={form.plan} onChange={set('plan')}>
              <option>Basic</option>
              <option>Pro</option>
              <option>Business</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={set('status')}>
              <option>Active</option>
              <option>Pending</option>
              <option>Inactive</option>
            </select>
          </label>
        </div>
        <button type="submit" className="btn sage block" disabled={!valid}>
          <Icon name="plus" size={16} stroke={2.2} /> Add client
        </button>
      </form>
    </Modal>
  )
}

export function TransferModal({ open, onClose }) {
  const { sendTransfer, M, clients } = useApp()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const n = Number(amount)
  const tooMuch = n > M.balance
  const valid = to.trim() && n > 0 && !tooMuch

  return (
    <Modal open={open} onClose={onClose} title="New transfer" sub={`Available balance ${money(M.balance)}`}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          sendTransfer({ to: to.trim(), amount: Math.round(n * 100) / 100, note: note.trim() })
          setTo('')
          setAmount('')
          setNote('')
          onClose()
        }}
      >
        <label className="field">
          <span>Send to</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} list="transfer-people" placeholder="Name or company" autoFocus />
          <datalist id="transfer-people">
            {clients.slice(0, 12).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Amount</span>
          <div className={`amount-input ${tooMuch ? 'bad' : ''}`}>
            <b>$</b>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0.00" />
          </div>
          {tooMuch ? <small className="err">That’s more than your balance.</small> : null}
        </label>
        <label className="field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What’s it for?" />
        </label>
        <button type="submit" className="btn sage block" disabled={!valid}>
          <Icon name="send" size={16} /> Send {n > 0 ? money(n) : ''}
        </button>
      </form>
    </Modal>
  )
}

export function LogoutModal({ open, onClose }) {
  const { signOut } = useApp()
  return (
    <Modal open={open} onClose={onClose} title="Log out?" width={380}>
      <div className="logout-body">
        <span className="logout-ic">
          <Icon name="logout" size={26} />
        </span>
        <p>Your data stays on this device. Estaro will be right here when you come back.</p>
        <div className="row-btns">
          <button type="button" className="btn" onClick={onClose}>
            Stay
          </button>
          <button type="button" className="btn danger" onClick={signOut}>
            Log out
          </button>
        </div>
      </div>
    </Modal>
  )
}
