// Efectos de sonido sintetizados con Web Audio API — sin archivos externos
// (no hay forma de traer assets de audio de internet acá, así que se generan
// tonos cortos en el momento). Un solo AudioContext compartido y reusado.

let ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const MUTE_KEY = 'bj-sound-muted';

export function isMuted() {
  return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted) {
  if (typeof window !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

function tone({ freq, duration = 0.12, type = 'sine', gain = 0.08, delay = 0, glideTo = null }) {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Fichas cayendo sobre el fieltro: un clic corto y seco.
export function playChip() {
  tone({ freq: 1400, duration: 0.05, type: 'square', gain: 0.05 });
}

// Carta deslizándose: un "swish" agudo que baja rápido.
export function playCard(delay = 0) {
  tone({ freq: 900, glideTo: 300, duration: 0.09, type: 'triangle', gain: 0.05, delay });
}

// Repartir varias cartas en cascada.
export function playDealSequence(count, stagger = 0.14) {
  for (let i = 0; i < count; i += 1) playCard(i * stagger);
}

export function playWin() {
  tone({ freq: 523.25, duration: 0.14, type: 'sine', gain: 0.09 });
  tone({ freq: 659.25, duration: 0.16, type: 'sine', gain: 0.09, delay: 0.1 });
  tone({ freq: 783.99, duration: 0.22, type: 'sine', gain: 0.1, delay: 0.2 });
}

export function playBlackjack() {
  playWin();
  tone({ freq: 987.77, duration: 0.3, type: 'sine', gain: 0.08, delay: 0.32 });
}

export function playLose() {
  tone({ freq: 220, glideTo: 140, duration: 0.35, type: 'sawtooth', gain: 0.05 });
}

export function playPush() {
  tone({ freq: 440, duration: 0.14, type: 'sine', gain: 0.06 });
}
