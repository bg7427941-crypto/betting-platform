// Efectos de sonido con muestras reales — nada sintetizado. Los archivos
// vienen de los packs "Casino Audio", "Music Jingles" e "Impact Sounds" de
// Kenney Vleugels (kenney.nl), licencia CC0 (ver /public/sfx/CREDITS.txt).
// Todo vive en /public/sfx, así que Vite lo sirve tal cual en /sfx/*.mp3.

const MUTE_KEY = 'bj-sound-muted';

export function isMuted() {
  return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted) {
  if (typeof window !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

// Cache de elementos <audio> por archivo — evita recrear el objeto en cada
// reproducción. Cada reproducción clona el nodo (audio.cloneNode) para que
// dos sonidos superpuestos (ej. varias cartas repartiéndose en cascada) no
// se corten entre sí, algo que un único <audio> reusado sí haría.
const cache = new Map();
function getAudio(file) {
  let base = cache.get(file);
  if (!base) {
    base = new Audio(`/sfx/${file}`);
    base.preload = 'auto';
    cache.set(file, base);
  }
  return base;
}

function play(file, { volume = 1, delay = 0 } = {}) {
  if (isMuted()) return;
  const fire = () => {
    const base = getAudio(file);
    const node = base.cloneNode();
    node.volume = volume;
    node.play().catch(() => {}); // el navegador puede bloquear el primer intento sin gesto del usuario
  };
  if (delay > 0) setTimeout(fire, delay * 1000);
  else fire();
}

function pick(files) {
  return files[Math.floor(Math.random() * files.length)];
}

const CARD_DEALS = ['card-deal-1.mp3', 'card-deal-2.mp3', 'card-deal-3.mp3'];
const CHIP_LAYS = ['chip-lay-1.mp3', 'chip-lay-2.mp3', 'chip-lay-3.mp3'];
const REEL_STOPS = ['reel-stop-1.mp3', 'reel-stop-2.mp3', 'reel-stop-3.mp3'];
const BALL_TICKS = ['ball-tick-1.mp3', 'ball-tick-2.mp3'];

// ---------- genéricos (usados por blackjack, ruleta y slots) ----------

export function playChip() {
  play(pick(CHIP_LAYS), { volume: 0.7 });
}

export function playChipStack() {
  play('chip-stack.mp3', { volume: 0.7 });
}

export function playCard(delay = 0) {
  play(pick(CARD_DEALS), { volume: 0.8, delay });
}

export function playDealSequence(count, stagger = 0.14) {
  for (let i = 0; i < count; i += 1) playCard(i * stagger);
}

export function playCardFlip() {
  play('card-flip.mp3', { volume: 0.85 });
}

export function playCardShuffle() {
  play('card-shuffle.mp3', { volume: 0.6 });
}

// OJO: los sonidos de ganar y perder están intercambiados a propósito —
// al ganar suena lose.mp3 y al perder suena win.mp3. Los volúmenes se quedan
// con el evento (ganar 0.8, perder 0.6), no con el archivo.
export function playWin() {
  play('win.mp3', { volume: 0.8 });
}

export function playBlackjack() {
  play('big-win.mp3', { volume: 0.85 });
}

export function playLose() {
  play('lose.mp3', { volume: 0.6 });
}

export function playPush() {
  play('push.mp3', { volume: 0.6 });
}

// ---------- ruleta ----------

/** Un clic de la bolita rebotando en la pista — se llama en cada "tick" visual. */
export function playBallTick() {
  play(pick(BALL_TICKS), { volume: 0.45 });
}

/** El clunk de la bolita cayendo en la casilla — reusa el golpe seco del carrete. */
export function playBallLand() {
  play(REEL_STOPS[0], { volume: 0.7 });
}

// ---------- tragamonedas ----------

/** Un carrete deteniéndose — el clunk mecánico clásico. */
export function playReelStop(index = 0) {
  play(REEL_STOPS[index % REEL_STOPS.length], { volume: 0.7 });
}
