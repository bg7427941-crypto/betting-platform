// Efectos de sonido con Tone.js — todo sintetizado, sin archivos de audio
// externos (no hay forma de traer assets de internet acá). Tone.js da
// sintetizadores y filtros mejores que un oscilador crudo, así que las
// fichas, cartas y fanfarrias suenan más "de casino" y menos "beep de juego
// de los 90". La API pública (isMuted/setMuted/playChip/playCard/...) queda
// igual que antes para no tocar los componentes que la usan.

// Tone.js pesa bastante (~250KB) — se importa en forma diferida (recién
// cuando se reproduce el primer sonido), así no infla el bundle inicial
// para quien todavía no entró a jugar blackjack.
let Tone = null;

const MUTE_KEY = 'bj-sound-muted';

export function isMuted() {
  return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted) {
  if (typeof window !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

// Tone.js necesita un gesto del usuario para arrancar el AudioContext —
// se dispara solo, en el primer sonido que se intenta reproducir.
let started = false;
async function ensureStarted() {
  if (started) return true;
  try {
    if (!Tone) Tone = await import('tone');
    await Tone.start();
    started = true;
    return true;
  } catch {
    return false;
  }
}

// Instrumentos compartidos, creados una sola vez y reusados en cada
// llamada (crear un synth por sonido sería carísimo y con delay audible).
let chipSynth = null;
let cardNoise = null;
let cardFilter = null;
let melodySynth = null;
let loseSynth = null;
let loseFilter = null;

function buildInstruments() {
  if (chipSynth) return;

  // Ficha: percusión metálica corta y seca — clic de plástico/resina.
  chipSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
    harmonicity: 4.2,
    modulationIndex: 12,
    resonance: 2200,
    octaves: 0.8,
  }).toDestination();
  chipSynth.volume.value = -18;

  // Carta: ráfaga de ruido filtrada — el "swish" de una carta deslizándose.
  cardFilter = new Tone.Filter({ frequency: 2200, type: 'bandpass', Q: 0.6 }).toDestination();
  cardNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
  }).connect(cardFilter);
  cardNoise.volume.value = -18;

  // Victoria / blackjack: arpegio con un synth polifónico simple.
  melodySynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.25 },
  }).toDestination();
  melodySynth.volume.value = -12;

  // Derrota: glide descendente, apagado — sin ser "sonido cómico de fail".
  loseFilter = new Tone.Filter({ frequency: 900, type: 'lowpass' }).toDestination();
  loseSynth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.2 },
  }).connect(loseFilter);
  loseSynth.volume.value = -20;
}

async function withAudio(fn) {
  if (isMuted()) return;
  const ok = await ensureStarted();
  if (!ok) return;
  buildInstruments();
  fn();
}

export function playChip() {
  withAudio(() => chipSynth.triggerAttackRelease('C6', 0.05));
}

export function playCard(delay = 0) {
  withAudio(() => {
    const t = Tone.now() + delay;
    cardFilter.frequency.setValueAtTime(2400, t);
    cardFilter.frequency.exponentialRampToValueAtTime(700, t + 0.09);
    cardNoise.triggerAttackRelease(0.08, t);
  });
}

export function playDealSequence(count, stagger = 0.14) {
  for (let i = 0; i < count; i += 1) playCard(i * stagger);
}

export function playWin() {
  withAudio(() => {
    const t = Tone.now();
    melodySynth.triggerAttackRelease('C5', '16n', t);
    melodySynth.triggerAttackRelease('E5', '16n', t + 0.1);
    melodySynth.triggerAttackRelease('G5', '8n', t + 0.2);
  });
}

export function playBlackjack() {
  withAudio(() => {
    const t = Tone.now();
    melodySynth.triggerAttackRelease('C5', '16n', t);
    melodySynth.triggerAttackRelease('E5', '16n', t + 0.1);
    melodySynth.triggerAttackRelease('G5', '16n', t + 0.2);
    melodySynth.triggerAttackRelease(['C6', 'E6', 'G6'], '4n', t + 0.32);
  });
}

export function playLose() {
  withAudio(() => {
    const t = Tone.now();
    loseSynth.triggerAttackRelease('A3', 0.3, t);
    loseSynth.frequency.setValueAtTime('A3', t);
    loseSynth.frequency.exponentialRampToValueAtTime('E3', t + 0.32);
  });
}

export function playPush() {
  withAudio(() => melodySynth.triggerAttackRelease('A4', '16n'));
}
