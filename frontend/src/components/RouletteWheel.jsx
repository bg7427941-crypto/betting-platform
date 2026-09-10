import { useEffect, useRef, useState } from 'react';

// Orden real de los números en una ruleta europea (37 casillas)
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function pocketColor(n) {
  if (n === 0) return 'var(--felt-3)'; // el 0 se distingue con el verde de fieltro, no negro/rojo
  return RED_NUMBERS.has(n) ? 'var(--brick)' : '#141414';
}

const SLICE_ANGLE = 360 / WHEEL_ORDER.length;
const SIZE = 300;
const CENTER = SIZE / 2;
const OUTER_R = 142;
const INNER_R = 96;
const NUMBER_R = (OUTER_R + INNER_R) / 2; // radio donde van los números, mitad de cada casilla

const BALL_OUTER_R = OUTER_R - 6; // radio de la bolita mientras gira, cerca del borde
const BALL_LANDED_R = NUMBER_R; // radio al que "cae" la bolita, sobre el mismo anillo que los números

// tiempo mínimo que la rueda gira "a ciegas" antes de poder empezar a frenar,
// para que el giro se vea aunque el servidor responda casi al instante (localhost)
const MIN_SPIN_MS = 900;
const SETTLE_MS = 2400;
const SETTLE_SECONDS = SETTLE_MS / 1000;

function polarToXY(angleDeg, radius) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

function slicePath(index) {
  const start = index * SLICE_ANGLE;
  const end = start + SLICE_ANGLE;
  const [x1, y1] = polarToXY(start, OUTER_R);
  const [x2, y2] = polarToXY(end, OUTER_R);
  const [x3, y3] = polarToXY(end, INNER_R);
  const [x4, y4] = polarToXY(start, INNER_R);
  return `M ${x1} ${y1} A ${OUTER_R} ${OUTER_R} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER_R} ${INNER_R} 0 0 0 ${x4} ${y4} Z`;
}

/**
 * spinning: true mientras esperamos la respuesta del servidor (giro indefinido)
 * winningNumber: cuando llega, la rueda frena hasta dejarlo bajo el puntero
 * onSettled: se llama cuando termina la animación de frenado
 */
export function RouletteWheel({ spinning, winningNumber, onSettled }) {
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [ballRadius, setBallRadius] = useState(BALL_OUTER_R);
  const [transitionOn, setTransitionOn] = useState(false);
  const [landed, setLanded] = useState(false);
  const spinStartedAt = useRef(null);
  const settleTimers = useRef([]);

  function clearTimers() {
    settleTimers.current.forEach(clearTimeout);
    settleTimers.current = [];
  }

  // Giro indefinido mientras se espera el resultado (rueda y bola en direcciones opuestas)
  useEffect(() => {
    if (spinning) {
      clearTimers();
      spinStartedAt.current = Date.now();
      setTransitionOn(false);
      setLanded(false);
      setBallRadius(BALL_OUTER_R);
      setRotation((r) => r + 360 * 20);
      setBallRotation((r) => r - 360 * 26);
    }
  }, [spinning]);

  // Frenado hacia el número ganador, respetando un tiempo mínimo de giro visible.
  // La bolita gira Y cae hacia adentro (menor radio) al mismo tiempo que la rueda frena,
  // aterrizando exactamente sobre la casilla ganadora.
  useEffect(() => {
    if (winningNumber === null || winningNumber === undefined) return;

    const elapsed = spinStartedAt.current ? Date.now() - spinStartedAt.current : MIN_SPIN_MS;
    const waitBeforeSettling = Math.max(0, MIN_SPIN_MS - elapsed);

    const settleTimer = setTimeout(() => {
      setRotation((currentRotation) => {
        const pocketIndex = WHEEL_ORDER.indexOf(winningNumber);
        const pocketAngle = pocketIndex * SLICE_ANGLE;
        const currentMod = ((currentRotation % 360) + 360) % 360;
        const target = currentRotation - currentMod + 360 * 4 + (360 - pocketAngle);
        return target;
      });
      setBallRotation((currentBallRotation) => {
        const ballCurrentMod = ((currentBallRotation % 360) + 360) % 360;
        return currentBallRotation - ballCurrentMod - 360 * 3;
      });
      setBallRadius(BALL_LANDED_R);
      setTransitionOn(true);
    }, waitBeforeSettling);

    const doneTimer = setTimeout(() => {
      setLanded(true);
      onSettled && onSettled();
    }, waitBeforeSettling + SETTLE_MS);

    settleTimers.current.push(settleTimer, doneTimer);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningNumber]);

  useEffect(() => clearTimers, []);

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, margin: '0 auto' }}>
      {/* puntero fijo */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '9px solid transparent',
          borderRight: '9px solid transparent',
          borderTop: '15px solid var(--gold)',
          zIndex: 2,
        }}
      />
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={spinning && !transitionOn ? 'wheel-spinning' : ''}
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: transitionOn ? `transform ${SETTLE_SECONDS}s cubic-bezier(0.15, 0.85, 0.25, 1)` : 'none',
        }}
      >
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 8} fill="none" stroke="var(--gold)" strokeWidth="2" />
        {WHEEL_ORDER.map((n, i) => {
          const isWinner = landed && n === winningNumber;
          const midAngle = i * SLICE_ANGLE + SLICE_ANGLE / 2;
          const [tx, ty] = polarToXY(midAngle, NUMBER_R);
          return (
            <g key={n}>
              <path
                d={slicePath(i)}
                fill={pocketColor(n)}
                stroke={isWinner ? 'var(--gold)' : 'var(--felt)'}
                strokeWidth={isWinner ? 2.5 : 0.5}
                className={isWinner ? 'pocket-winner' : ''}
              />
              <text
                x={tx}
                y={ty}
                transform={`rotate(${midAngle}, ${tx}, ${ty})`}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fill="var(--parchment)"
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="2"
                paintOrder="stroke"
              >
                {n}
              </text>
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={INNER_R - 2} fill="var(--felt-2)" stroke="var(--gold)" strokeWidth="1.5" />
      </svg>

      {/* bolita: orbita en dirección contraria a la rueda y cae de radio al aterrizar */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${ballRotation}deg)`,
          transition: transitionOn ? `transform ${SETTLE_SECONDS}s cubic-bezier(0.25, 0.8, 0.3, 1)` : 'none',
          animation: spinning && !transitionOn ? 'ball-spin-fast 0.4s linear infinite' : 'none',
        }}
      >
        <circle
          cx={CENTER}
          cy={CENTER - ballRadius}
          r="5.5"
          fill="var(--parchment)"
          style={{ transition: transitionOn ? `cy ${SETTLE_SECONDS}s cubic-bezier(0.3, 0.7, 0.4, 1)` : 'none' }}
        />
      </svg>

      {landed && winningNumber !== null && winningNumber !== undefined && (
        <div
          className="wheel-result-badge"
          style={{ background: pocketColor(winningNumber), transform: 'translate(-50%, -50%)' }}
        >
          <span className="mono">{winningNumber}</span>
        </div>
      )}
    </div>
  );
}