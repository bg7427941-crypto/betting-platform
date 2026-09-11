import { useEffect, useRef, useState } from 'react';

// Debe reflejar EXACTAMENTE las 10 líneas de src/modules/casino/games.engine.js
// (fila por carril, 0 = arriba, 2 = abajo) — es lo que permite dibujar la línea
// ganadora en el lugar correcto sin que el backend tenga que mandar coordenadas.
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

const REELS = 5;
const ROWS = 3;
const CELL_W = 64;
const CELL_H = 58;
const GAP = 6;
const GRID_W = REELS * CELL_W + (REELS - 1) * GAP;
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP;

function cellCenter(reel, row) {
  return [reel * (CELL_W + GAP) + CELL_W / 2, row * (CELL_H + GAP) + CELL_H / 2];
}

const PLACEHOLDER_GRID = Array.from({ length: REELS }, () => Array(ROWS).fill('❔'));

// Cascada de frenado izquierda-a-derecha, un carril a la vez — se dispara
// quede cuando llegue el resultado, no desde que arrancó a girar (así no
// importa cuánto tarde la red).
const STOP_DELAYS = [350, 650, 950, 1250, 1550];
const SETTLE_GRACE_MS = 250;

export const SLOT_PAYTABLE = [
  { symbol: '7️⃣', values: '23.5 · 70 · 235 ×' },
  { symbol: '👑', values: '12 · 35 · 120 ×' },
  { symbol: '💎', values: '6 · 17.5 · 60 ×' },
  { symbol: '⭐', values: '3.5 · 9.5 · 23.5 ×' },
  { symbol: '🔔', values: '2.5 · 6 · 17.5 ×' },
  { symbol: '♥️ ♠️', values: '1.4 · 4.2 · 12 ×' },
  { symbol: '♣️ ♦️', values: '1.2 · 3.5 · 9.5 ×' },
  { symbol: '🃏', values: 'comodín (17.5 · 60 · 175 ×) — sustituye a cualquier símbolo' },
  { symbol: '💰', values: 'en cualquier posición: 25 · 120 · 600 × el total apostado' },
];

/**
 * spinning: true desde que se pide el giro hasta que termina la animación
 * (blur continuo mientras no hay `result` todavía — igual que RouletteWheel
 * con `winningNumber`). result: { grid, winningLines, scatterCount } — al
 * llegar dispara la cascada de frenado carril por carril. onSettled: se
 * llama cuando termina esa cascada (recién ahí el padre revela el payout).
 */
export function SlotMachine({ spinning, result, onSettled }) {
  const [displayGrid, setDisplayGrid] = useState(PLACEHOLDER_GRID);
  const [stoppedReels, setStoppedReels] = useState(0);
  const [showLines, setShowLines] = useState(false);
  const timers = useRef([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  // Arranca el giro: blur continuo, sin resultado todavía.
  useEffect(() => {
    if (!spinning) return;
    clearTimers();
    setShowLines(false);
    setStoppedReels(0);
    setDisplayGrid(PLACEHOLDER_GRID);
    return clearTimers;
  }, [spinning]);

  // Llegó el resultado: dispara la cascada de frenado carril por carril.
  useEffect(() => {
    if (!result) return;
    clearTimers();

    STOP_DELAYS.forEach((delay, reelIndex) => {
      const t = setTimeout(() => {
        setDisplayGrid((prev) => {
          const next = prev.map((col) => [...col]);
          next[reelIndex] = result.grid[reelIndex];
          return next;
        });
        setStoppedReels(reelIndex + 1);
        if (reelIndex === STOP_DELAYS.length - 1) {
          const settleTimer = setTimeout(() => {
            setShowLines(true);
            onSettled && onSettled();
          }, SETTLE_GRACE_MS);
          timers.current.push(settleTimer);
        }
      }, delay);
      timers.current.push(t);
    });

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => clearTimers, []);

  const winningLines = result?.winningLines;
  const scatterCount = result?.scatterCount ?? 0;

  const hitCells = new Set();
  if (showLines && winningLines) {
    for (const wl of winningLines) {
      const pattern = PAYLINES[wl.line];
      for (let reel = 0; reel < wl.length; reel += 1) {
        hitCells.add(`${reel}-${pattern[reel]}`);
      }
    }
  }
  const hasScatterHighlight = showLines && scatterCount >= 3;

  return (
    <div className="slot-grid-frame">
      <div className="slot-grid" style={{ width: GRID_W, height: GRID_H }}>
        {Array.from({ length: REELS }).flatMap((_, reel) =>
          Array.from({ length: ROWS }).map((__, row) => {
            const symbol = displayGrid[reel][row];
            const isSpinningCell = spinning && reel >= stoppedReels;
            const isHit = hitCells.has(`${reel}-${row}`);
            const isScatterCell = hasScatterHighlight && symbol === '💰';
            return (
              <div
                key={`${reel}-${row}`}
                className={`slot-cell ${isHit ? 'slot-cell-hit' : ''} ${
                  isScatterCell ? 'slot-cell-scatter' : ''
                }`}
                style={{ gridColumn: reel + 1, gridRow: row + 1 }}
              >
                <span className={isSpinningCell ? 'reel-spinning' : 'reel-symbol'}>{symbol}</span>
              </div>
            );
          })
        )}
      </div>

      {showLines && winningLines && winningLines.length > 0 && (
        <svg className="slot-lines-overlay" width={GRID_W} height={GRID_H} viewBox={`0 0 ${GRID_W} ${GRID_H}`}>
          {winningLines.map((wl, i) => {
            const pattern = PAYLINES[wl.line];
            const points = Array.from({ length: wl.length }, (_, reel) => cellCenter(reel, pattern[reel]));
            const pointsAttr = points.map(([x, y]) => `${x},${y}`).join(' ');
            return (
              <polyline
                key={i}
                points={pointsAttr}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
