/* ------------------------------------------------------------------
   Estaro's voice: the browser's own speech engine (Web Speech API). No
   API key, no cost, and it works for anyone who runs the dashboard.
   Estaro picks the most natural male English voice the browser offers
   (Google's in Chrome, Microsoft's natural voices in Edge, Apple's in
   Safari); Settings can pick another. Only one answer speaks at a time.
   ------------------------------------------------------------------ */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

let notify = () => {}
let spoken = [] // kept alive until done: Chrome skips onend for utterances it garbage-collects
let turn = 0

/** Tell the app when Estaro starts or stops speaking (the orb talks along). */
export const onSpeaking = (fn) => {
  notify = fn
}

/* ---------------- choosing a voice ---------------- */
// most natural male English voices first
const PREFERRED = [
  /^Microsoft (Andrew|Brian|Guy|Christopher|Eric|Roger|Steffan|Ryan|Thomas)\b.*Online/i, // Edge
  /^Google UK English Male$/i, // Chrome
  /^(Evan|Nathan|Tom|Aaron|Daniel|Arthur|Alex|Oliver|Jamie|Noah)\s*\((Premium|Enhanced)\)/i, // Apple, downloaded
  /^(Daniel|Aaron|Arthur|Alex|Oliver|Tom|Evan|Nathan)\b/i, // Apple, built in
  /^(Aman|Rishi|Gordon|Lee)\b/i,
  /^Microsoft (David|Mark|George|Ravi)\b/i, // Windows
  /^Google US English$/i,
]
// macOS novelty and old robotic voices
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Jester|Junior|Kathy|Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i

/** English voices worth offering, as the browser lists them. */
export const englishVoices = () => (synth?.getVoices() ?? []).filter((v) => /^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name))

/** The voice Estaro speaks with: the one picked in Settings, else the best male English voice. */
export function bestVoice(name) {
  const list = englishVoices()
  const picked = name && list.find((v) => v.name === name)
  if (picked) return picked
  for (const re of PREFERRED) {
    const v = list.find((x) => re.test(x.name))
    if (v) return v
  }
  return list.find((v) => v.default) ?? list[0] ?? null
}

/** Call `fn` whenever the browser's voice list changes (it loads late in Chrome). */
export function watchVoices(fn) {
  synth?.addEventListener?.('voiceschanged', fn)
  return () => synth?.removeEventListener?.('voiceschanged', fn)
}

// Safari only lets speech start from a click or key press, so the first one
// speaks a silent utterance; after that answers can speak on their own.
const GESTURES = ['pointerdown', 'keydown', 'touchend']
const unlock = () => {
  GESTURES.forEach((g) => window.removeEventListener(g, unlock, true))
  if (synth && !synth.speaking) {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    synth.speak(u)
  }
}
if (synth) GESTURES.forEach((g) => window.addEventListener(g, unlock, true))

/* ---------------- speaking ---------------- */
/** Answer text as it should be read: no markdown, emails, symbols or cents. */
export const readable = (text) =>
  text
    .replace(/\*\*/g, '')
    .replace(/\s*Email:\s*\S+@\S+?(?=\.?(?:\s|$))/g, '')
    .replace(/[“”"]/g, '')
    .replace(/(\$\d{1,3}(?:,\d{3})+|\$\d{3,})\.\d{2}\b/g, '$1')
    .replace(/\s·\s/g, ', ')
    .replace(/\s×\s/g, ' times ')
    .replace(/\s=\s/g, ' equals ')
    .replace(/\(\+/g, '(up ')
    .replace(/\(−/g, '(down ')
    .replace(/★/g, ' stars')
    .replace(/\bvs\b/g, 'versus')
    .replace(/(\d+)h ago/g, '$1 hours ago')
    .replace(/(\d+) min ago/g, '$1 minutes ago')
    .replace(/\s+/g, ' ')
    .trim()

export function stopSpeaking() {
  turn++
  spoken = []
  synth?.cancel()
  notify(false)
}

/**
 * Read `text` aloud with `voiceName` (or the best male English voice),
 * cutting off anything already playing.
 */
export function speakText(text, voiceName) {
  const busy = synth?.speaking || synth?.pending
  stopSpeaking()
  if (!synth) return
  const mine = turn
  const voice = bestVoice(voiceName)
  // sentence by sentence: Chrome's Google voices stop after ~15 s of one utterance
  const parts = readable(text).split(/(?<=[.!?])\s+(?=[A-Z0-9$])/).filter(Boolean)
  const say = () => {
    if (mine !== turn) return
    spoken = parts.map((part, i) => {
      const u = new SpeechSynthesisUtterance(part)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      }
      u.onstart = () => mine === turn && notify(true)
      if (i === parts.length - 1) u.onend = () => mine === turn && notify(false)
      u.onerror = () => mine === turn && notify(false)
      return u
    })
    synth.resume() // Chrome can be left paused after a long idle
    spoken.forEach((u) => synth.speak(u))
  }
  // speaking straight after cancel() can drop the first sentence in Chrome
  if (busy) window.setTimeout(say, 80)
  else say()
}
