// Short CC0 recordings, decoded once and mixed through a shared Web Audio graph.
// See public/sfx/CREDITS.txt for the sources and processing.
const MUTE_KEY = 'bj-sound-muted';
const VOLUME_KEY = 'casino-sound-volume';
const MAX_VOICES = 12;
const FILES = [
  'card-deal-1.mp3',
  'card-deal-2.mp3',
  'card-deal-3.mp3',
  'card-flip.mp3',
  'card-shuffle.mp3',
  'chip-lay-1.mp3',
  'chip-lay-2.mp3',
  'chip-lay-3.mp3',
  'chip-stack.mp3',
  'ball-tick-1.mp3',
  'ball-tick-2.mp3',
  'ball-land.mp3',
  'reel-stop-1.mp3',
  'reel-stop-2.mp3',
  'reel-stop-3.mp3',
  'win.mp3',
  'big-win.mp3',
  'lose.mp3',
  'push.mp3',
];
function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function normalizedVolume(value) {
  const number = value === null ? 0.55 : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.55;
}
let muted = readPreference(MUTE_KEY) === '1';
let volume = normalizedVolume(readPreference(VOLUME_KEY));
let context;
let master;
let resumePromise;
let unlocked = false;
let generation = 0;
let lastTick = -Infinity;
const buffers = new Map();
const voices = new Set();
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function isMuted() {
  return muted;
}
export function getVolume() {
  return volume;
}
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getContext() {
  if (context) return context;
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    context = new AudioContext({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    return context;
  } catch {
    return null;
  }
}

// Call synchronously from a user gesture; never resume audio automatically.
export function unlockAudio() {
  if (muted || (typeof document !== 'undefined' && document.hidden)) return;
  const ctx = getContext();
  if (ctx) unlocked = true;
  if (ctx?.state === 'suspended' && !resumePromise) {
    resumePromise = ctx
      .resume()
      .catch(() => {})
      .finally(() => {
        resumePromise = null;
      });
  }
}

function disposeVoice(voice) {
  voices.delete(voice);
  try {
    voice.source.stop();
  } catch {}
  voice.source.disconnect();
  voice.gain.disconnect();
}

export function stopAllSounds() {
  generation++;
  lastTick = -Infinity;
  for (const voice of voices) disposeVoice(voice);
}

export function setMuted(value) {
  muted = Boolean(value);
  savePreference(MUTE_KEY, muted ? '1' : '0');
  if (muted) stopAllSounds();
  else unlockAudio();
  notify();
}

export function setVolume(value) {
  if (!Number.isFinite(Number(value))) return;
  volume = normalizedVolume(value);
  savePreference(VOLUME_KEY, String(volume));
  if (master) master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
  if (volume === 0) stopAllSounds();
  notify();
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === MUTE_KEY) {
      muted = event.newValue === '1';
      if (muted) stopAllSounds();
      notify();
    }
    if (event.key === VOLUME_KEY) {
      volume = normalizedVolume(event.newValue);
      if (master) master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
      if (volume === 0) stopAllSounds();
      notify();
    }
  });

function loadBuffer(file) {
  if (buffers.has(file)) return buffers.get(file);
  const ctx = getContext();
  if (!ctx) return Promise.resolve(null);
  const pending = fetch(`/sfx/${file}`)
    .then((response) => {
      if (!response.ok) throw new Error('Audio unavailable');
      return response.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
  buffers.set(file, pending);
  return pending;
}

export function preloadSounds() {
  return Promise.all(FILES.map(loadBuffer));
}

function play(file, { volume: level = 0.7, delay = 0, rate = 1 } = {}) {
  if (!unlocked || muted || volume === 0 || (typeof document !== 'undefined' && document.hidden))
    return;
  const ctx = getContext();
  if (!ctx || (ctx.state !== 'running' && !resumePromise)) return;
  const version = generation;
  const requested = performance.now();
  const when = ctx.currentTime + delay;
  Promise.all([loadBuffer(file), resumePromise])
    .then(([buffer]) => {
      if (
        !buffer ||
        version !== generation ||
        muted ||
        volume === 0 ||
        ctx.state !== 'running' ||
        performance.now() - requested > 500 ||
        (typeof document !== 'undefined' && document.hidden)
      )
        return;
      if (voices.size >= MAX_VOICES) disposeVoice(voices.values().next().value);
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      gain.gain.value = level;
      source.connect(gain);
      gain.connect(master);
      const voice = { source, gain };
      source.onended = () => {
        voices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      voices.add(voice);
      source.start(Math.max(ctx.currentTime, when));
    })
    .catch(() => {});
}

const pick = (files) => files[Math.floor(Math.random() * files.length)];
const CARD_DEALS = ['card-deal-1.mp3', 'card-deal-2.mp3', 'card-deal-3.mp3'];
const CHIP_LAYS = ['chip-lay-1.mp3', 'chip-lay-2.mp3', 'chip-lay-3.mp3'];
const REEL_STOPS = ['reel-stop-1.mp3', 'reel-stop-2.mp3', 'reel-stop-3.mp3'];
const BALL_TICKS = ['ball-tick-1.mp3', 'ball-tick-2.mp3'];

export function playChip() {
  play(pick(CHIP_LAYS), { volume: 0.65 });
}
export function playChipStack() {
  play('chip-stack.mp3', { volume: 0.65 });
}
export function playCard(delay = 0) {
  play(pick(CARD_DEALS), { volume: 0.65, delay });
}
export function playDealSequence(count, stagger = 0.12) {
  for (let index = 0; index < count; index++) playCard(index * stagger);
}
export function playCardFlip() {
  play('card-flip.mp3', { volume: 0.65 });
}
export function playCardShuffle() {
  play('card-shuffle.mp3', { volume: 0.45 });
}
export function playWin() {
  play('win.mp3', { volume: 0.65 });
}
export function playBlackjack() {
  play('big-win.mp3', { volume: 0.7 });
}
export function playLose() {
  play('lose.mp3', { volume: 0.35 });
}
export function playPush() {
  play('push.mp3', { volume: 0.4 });
}
export function playBallTick() {
  const now = performance.now();
  if (now - lastTick < 75) return;
  lastTick = now;
  play(pick(BALL_TICKS), { volume: 0.3 });
}
export function playBallLand() {
  play('ball-land.mp3', { volume: 0.55 });
}
export function playReelStop(index = 0) {
  play(REEL_STOPS[index % REEL_STOPS.length], { volume: 0.55, rate: 1 + index * 0.025 });
}
