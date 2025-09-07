let audioCtx: AudioContext | null = null

function getCtx() {
  if (!audioCtx) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (Ctx) audioCtx = new Ctx()
  }
  return audioCtx
}

export function playBeep(freq = 440, duration = 0.08, volume = 0.05) {
  const ctx = getCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.value = volume
  osc.connect(gain)
  gain.connect(ctx.destination)
  const now = ctx.currentTime
  osc.start(now)
  osc.stop(now + duration)
}

export function playClick(mark: 'X' | 'O') {
  // Slightly different tones for X and O
  playBeep(mark === 'X' ? 520 : 360, 0.07, 0.06)
}

export function playWin(mark: 'X' | 'O' | 'draw') {
  const ctx = getCtx()
  if (!ctx) return
  const seq = mark === 'draw' ? [440, 440] : mark === 'X' ? [523, 659, 784] : [392, 523, 659]
  let t = 0
  for (const f of seq) {
    setTimeout(() => playBeep(f, 0.09, 0.06), t)
    t += 110
  }
}

