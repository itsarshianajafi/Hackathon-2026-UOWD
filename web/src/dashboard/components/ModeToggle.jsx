import { Segmented } from './ui'
import { useApp } from '../lib/store'

const MODES = [
  { key: 'investor', label: 'Investors' },
  { key: 'buyer', label: 'Buyers' },
]

export default function ModeToggle() {
  const { mode, setMode } = useApp()
  return <Segmented className="mode-seg" items={MODES} value={mode} onChange={setMode} />
}
