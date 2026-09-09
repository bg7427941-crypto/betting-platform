import { useEffect, useState } from 'react';

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
const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER_R = 104;
const INNER_R = 70;

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
  const [transitionOn, setTransitionOn] = useState(false);

  // Giro indefinido mientras se espera el resultado (rueda y bola en direcciones opuestas)
  useEffect(() => {
    if (spinning) {
      setTransitionOn(false);
      setRotation((r) => r + 360 * 20);
      setBallRotation((r) => r - 360 * 26);
    }
  }, [spinning]);

  // Frenado hacia el número ganador
  useEffect(() => {
    if (winningNumber === null || winningNumber === undefined) return;
    const pocketIndex = WHEEL_ORDER.indexOf(winningNumber);
    const pocketAngle = pocketIndex * SLICE_ANGLE;
    const currentMod = ((rotation % 360) + 360) % 360;
    const target = rotation - currentMod + 360 * 4 + (360 - pocketAngle);

    const ballCurrentMod = ((ballRotation % 360) + 360) % 360;
    const ballTarget = ballRotation - ballCurrentMod - 360 * 3;

    setTransitionOn(true);
    setRotation(target);
    setBallRotation(ballTarget);

    const timeout = setTimeout(() => {
      onSettled && onSettled();
    }, 2600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningNumber]);

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, margin: '0 auto' }}>
      {/* puntero fijo */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '12px solid var(--gold)',
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
          transition: transitionOn ? 'transform 2.5s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
        }}
      >
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 6} fill="none" stroke="var(--gold)" strokeWidth="2" />
        {WHEEL_ORDER.map((n, i) => (
          <path key={n} d={slicePath(i)} fill={pocketColor(n)} stroke="var(--felt)" strokeWidth="0.5" />
        ))}
        <circle cx={CENTER} cy={CENTER} r={INNER_R - 2} fill="var(--felt-2)" stroke="var(--gold)" strokeWidth="1.5" />
      </svg>

      {/* bolita: orbita en dirección contraria a la rueda, en un anillo aparte */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${ballRotation}deg)`,
          transition: transitionOn ? 'transform 2.5s cubic-bezier(0.25, 0.8, 0.3, 1)' : 'none',
          animation: spinning && !transitionOn ? 'ball-spin-fast 0.45s linear infinite' : 'none',
        }}
      >
        <circle cx={CENTER} cy={CENTER - OUTER_R + 4} r="4.5" fill="var(--parchment)" />
      </svg>
    </div>
  );
}