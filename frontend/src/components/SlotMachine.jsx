import { useEffect, useId, useRef, useState } from 'react';
import * as sound from '../lib/sound';
import { useReducedMotion } from '../lib/useReducedMotion';
import { planReelLanding, REEL_CYCLE_ROWS, REEL_TRACK_ROWS, SLOT_RHYTHMS } from '../lib/slotMotion';
import { SlotArtwork, SlotSymbol } from './SlotArtwork';

// Matches the ten server paylines: row per reel, top to bottom.
const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];
const REEL_SYMBOLS = ['7️⃣', '👑', '💎', '⭐', '🔔', '♠️'];
const PLACEHOLDER_GRID = Array.from({ length: 5 }, (_, reel) =>
  Array.from({ length: 3 }, (_, row) => REEL_SYMBOLS[(reel + row) % REEL_SYMBOLS.length])
);
const reelTransform = (rows) => `translateY(-${(rows / REEL_TRACK_ROWS) * 100}%)`;
export const SLOT_PAYTABLE = [
  { symbol: '7️⃣', values: '23.5 · 70 · 235 ×' },
  { symbol: '👑', values: '12 · 35 · 120 ×' },
  { symbol: '💎', values: '6 · 17.5 · 60 ×' },
  { symbol: '⭐', values: '3.5 · 9.5 · 23.5 ×' },
  { symbol: '🔔', values: '2.5 · 6 · 17.5 ×' },
  { symbol: '♥️ ♠️', values: '1.4 · 4.2 · 12 ×' },
  { symbol: '♣️ ♦️', values: '1.2 · 3.5 · 9.5 ×' },
  {
    symbol: '🃏',
    values: 'comodín (17.5 · 60 · 175 ×) — sustituye a cualquier símbolo',
  },
  {
    symbol: '💰',
    values:
      'en cualquier posición: 25 · 120 · 600 × el total apostado · 3+ activa Corona Ascendente',
  },
];

function SlotReel({
  reel,
  spinning,
  result,
  display,
  turbo,
  reducedMotion,
  artworkId,
  hitCells,
  scatter,
  onStopped,
}) {
  const viewport = useRef(null);
  const track = useRef(null);
  const loop = useRef(null);
  const startedAt = useRef(0);
  const stoppedCallback = useRef(onStopped);
  const [phase, setPhase] = useState('idle');
  const base = useRef(
    Array.from(
      { length: REEL_TRACK_ROWS },
      (_, row) => REEL_SYMBOLS[(row + reel) % REEL_SYMBOLS.length]
    )
  );
  const [symbols, setSymbols] = useState(base.current);
  const rhythm = turbo ? SLOT_RHYTHMS.fast : SLOT_RHYTHMS.normal;
  stoppedCallback.current = onStopped;

  useEffect(() => {
    if (!spinning) {
      setPhase('idle');
      return;
    }
    startedAt.current = performance.now();
    setSymbols(base.current);
    setPhase(reducedMotion ? 'pending' : 'rolling');
    const node = track.current;
    node.style.transform = reelTransform(0);
    if (!reducedMotion && node.animate) {
      loop.current = node.animate(
        [{ transform: reelTransform(0) }, { transform: reelTransform(REEL_CYCLE_ROWS) }],
        { duration: rhythm.cycle, iterations: Infinity, easing: 'linear' }
      );
    }
    return () => {
      loop.current?.cancel();
      loop.current = null;
    };
  }, [spinning, reducedMotion, rhythm]);

  useEffect(() => {
    if (!spinning || !result) return;
    let disposed = false;
    let braking;
    let revealTimer;
    const finish = () => {
      if (disposed) return;
      setPhase('landed');
      braking?.cancel();
      track.current.style.transform = reelTransform(0);
      sound.playReelStop(reel);
      stoppedCallback.current(reel);
    };
    const timer = setTimeout(
      () => {
        const node = track.current;
        const rowHeight = parseFloat(getComputedStyle(viewport.current).height) / 3;
        if (reducedMotion || !node.animate || !rowHeight) {
          setPhase('revealing');
          revealTimer = setTimeout(finish, rhythm.reveal);
          return;
        }
        const transform = getComputedStyle(node).transform;
        const offset = transform === 'none' ? 0 : -new DOMMatrixReadOnly(transform).m42 / rowHeight;
        const landing = planReelLanding(offset, rhythm, reel);
        node.style.transform = reelTransform(landing.from);
        loop.current?.cancel();
        const next = [...base.current];
        result.forEach((symbol, row) => {
          next[landing.target + row] = symbol;
        });
        setSymbols(next);
        setPhase('braking');
        braking = node.animate(
          [
            { transform: reelTransform(landing.from) },
            { transform: reelTransform(landing.target) },
          ],
          { duration: landing.duration, easing: landing.easing, fill: 'forwards' }
        );
        braking.finished.then(finish).catch(() => {});
      },
      Math.max(0, rhythm.minimum - (performance.now() - startedAt.current)) +
        (reducedMotion || !track.current.animate ? reel * rhythm.stagger : 0)
    );
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(revealTimer);
      braking?.cancel();
    };
  }, [spinning, result, reel, rhythm, reducedMotion]);

  const moving = phase === 'rolling' || phase === 'braking';
  const visible = phase === 'revealing' ? result : display;
  return (
    <div ref={viewport} className="slot-reel" data-phase={phase} aria-hidden={moving || undefined}>
      <div className="slot-reel-rest">
        {visible.map((symbol, row) => (
          <div
            key={row}
            className={`slot-cell ${hitCells.has(`${reel}-${row}`) ? 'slot-cell-hit' : ''} ${scatter && symbol === '💰' ? 'slot-cell-scatter' : ''}`}
            data-symbol={symbol}
          >
            <SlotSymbol symbol={symbol} artworkId={artworkId} />
          </div>
        ))}
      </div>
      <div
        ref={track}
        className="slot-reel-track"
        aria-hidden="true"
        style={{
          height: `${(REEL_TRACK_ROWS / 3) * 100}%`,
          gridTemplateRows: `repeat(${REEL_TRACK_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {symbols.map((symbol, row) => (
          <div className="slot-reel-tile" key={row}>
            <SlotSymbol symbol={symbol} artworkId={artworkId} decorative />
          </div>
        ))}
      </div>
      <div className="slot-reel-shade" aria-hidden="true" />
    </div>
  );
}

export function SlotMachine({ spinning, result, turbo = false, onSettled, artworkId }) {
  const ownId = useId().replaceAll(':', '');
  const art = artworkId || `slot-${ownId}`;
  const [displayGrid, setDisplayGrid] = useState(PLACEHOLDER_GRID);
  const [stoppedReels, setStoppedReels] = useState(new Set());
  const [showLines, setShowLines] = useState(false);
  const settled = useRef(false);
  const callback = useRef(onSettled);
  const reducedMotion = useReducedMotion();
  callback.current = onSettled;

  useEffect(() => {
    if (!spinning) return;
    settled.current = false;
    setStoppedReels(new Set());
    setShowLines(false);
  }, [spinning]);

  useEffect(() => {
    if (!spinning || !result || stoppedReels.size !== 5 || settled.current) return;
    const timer = setTimeout(
      () => {
        settled.current = true;
        setShowLines(true);
        callback.current?.();
      },
      (turbo ? SLOT_RHYTHMS.fast : SLOT_RHYTHMS.normal).grace
    );
    return () => clearTimeout(timer);
  }, [spinning, result, stoppedReels, turbo]);

  function stopReel(reel) {
    setDisplayGrid((previous) =>
      previous.map((column, index) => (index === reel ? result.grid[reel] : column))
    );
    setStoppedReels((previous) => new Set([...previous, reel]));
  }
  const hitCells = new Set();
  if (showLines) {
    for (const line of result?.winningLines || []) {
      for (let reel = 0; reel < line.length; reel++)
        hitCells.add(`${reel}-${PAYLINES[line.line][reel]}`);
    }
  }

  return (
    <div
      className="slot-grid-frame"
      data-spinning={spinning}
      aria-label="Carretes de Corona Real"
      aria-busy={spinning}
    >
      {!artworkId && <SlotArtwork id={art} />}
      <div className="slot-grid">
        {displayGrid.map((display, reel) => (
          <SlotReel
            key={reel}
            reel={reel}
            display={display}
            spinning={spinning}
            result={result?.grid?.[reel]}
            turbo={turbo}
            reducedMotion={reducedMotion}
            artworkId={art}
            hitCells={hitCells}
            scatter={showLines && result?.scatterCount >= 3}
            onStopped={stopReel}
          />
        ))}
        {showLines && result?.winningLines?.length > 0 && (
          <svg
            className="slot-lines-overlay"
            viewBox="0 0 500 300"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {result.winningLines.map((line, index) => (
              <polyline
                key={index}
                points={Array.from(
                  { length: line.length },
                  (_, reel) => `${reel * 100 + 50},${PAYLINES[line.line][reel] * 100 + 50}`
                ).join(' ')}
                fill="none"
                stroke="#c09849"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
      </div>
      <div className="slot-reel-markers" aria-hidden="true">
        <span>10</span>
        <span>LÍNEAS DE PAGO</span>
        <span>10</span>
      </div>
    </div>
  );
}
