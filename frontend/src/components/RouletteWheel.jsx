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
  if (n === 0) return 'var(--felt-3)';
  return RED_NUMBERS.has(n) ? 'var(--brick)' : '#141414';
}

function resultTextColor(n) {
  if (n === 0) return 'var(--gold)';
  return RED_NUMBERS.has(n) ? 'var(--brick)' : 'var(--parchment)';
}

function resultLabel(n) {
  if (n === 0) return 'Verde';
  return RED_NUMBERS.has(n) ? 'Rojo' : 'Negro';
}

const SLICE_ANGLE = 360 / WHEEL_ORDER.length;
const SIZE = 300;
const CENTER = SIZE / 2;

const WEDGE_OUTER_R = 124;
const WEDGE_INNER_R = 88;
const NUMBER_R = (WEDGE_OUTER_R + WEDGE_INNER_R) / 2;

const TRACK_MID_R = 138;
const TRACK_WIDTH = 16;
const RIM_R = 150;
const BALL_TRACK_RADIUS = 137;
const BALL_LANDED_RADIUS = NUMBER_R;

const MIN_SPIN_MS = 900;
const SETTLE_MS = 3400; // frenado lento y gradual
const SETTLE_SECONDS = SETTLE_MS / 1000;
const RADIUS_DROP_SHARE = 0.6; // más tiempo rozando la pista antes de caer
const RADIUS_DROP_SECONDS = (SETTLE_MS * (1 - RADIUS_DROP_SHARE)) / 1000;

// giro continuo "a ciegas": se hace a pasitos con transiciones cortas y lineales,
// nunca con una animación en bucle — así jamás salta de vuelta a un ángulo fijo.
const TICK_MS = 220;
const WHEEL_TICK_DEG = 95;
const BALL_TICK_DEG = 140;

function polarToXY(angleDeg, radius) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

function slicePath(index) {
  const start = index * SLICE_ANGLE;
  const end = start + SLICE_ANGLE;
  const [x1, y1] = polarToXY(start, WEDGE_OUTER_R);
  const [x2, y2] = polarToXY(end, WEDGE_OUTER_R);
  const [x3, y3] = polarToXY(end, WEDGE_INNER_R);
  const [x4, y4] = polarToXY(start, WEDGE_INNER_R);
  return `M ${x1} ${y1} A ${WEDGE_OUTER_R} ${WEDGE_OUTER_R} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${WEDGE_INNER_R} ${WEDGE_INNER_R} 0 0 0 ${x4} ${y4} Z`;
}

/**
 * spinning: true mientras esperamos la respuesta del servidor (giro indefinido)
 * winningNumber: cuando llega, la rueda frena hasta dejarlo bajo el puntero
 * onSettled: se llama cuando termina la animación de frenado
 */
export function RouletteWheel({ spinning, winningNumber, onSettled }) {
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [ballRadius, setBallRadius] = useState(BALL_TRACK_RADIUS);
  const [radiusTransitionSeconds, setRadiusTransitionSeconds] = useState(0);
  // 'idle' | 'spin' (giro continuo a pasitos) | 'settle' (frenado hacia el número)
  const [phase, setPhase] = useState('idle');
  const [landed, setLanded] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const spinStartedAt = useRef(null);
  const tickInterval = useRef(null);
  const timers = useRef([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function stopTicking() {
    if (tickInterval.current) {
      clearInterval(tickInterval.current);
      tickInterval.current = null;
    }
  }

  // Giro continuo mientras se espera el resultado: se avanza a pasitos cortos con
  // transiciones lineales — nunca una animación en bucle, así el ángulo siempre
  // continúa desde donde iba, sin saltar de vuelta al inicio.
  useEffect(() => {
    if (spinning) {
      clearTimers();
      stopTicking();
      spinStartedAt.current = Date.now();
      setLanded(false);
      setBouncing(false);
      setRadiusTransitionSeconds(0);
      setBallRadius(BALL_TRACK_RADIUS);
      setPhase('spin');
      tickInterval.current = setInterval(() => {
        setRotation((r) => r + WHEEL_TICK_DEG);
        setBallRotation((r) => r - BALL_TICK_DEG);
      }, TICK_MS);
    }
    return () => {
      if (!spinning) stopTicking();
    };
  }, [spinning]);

  // Frenado: primero la bola sigue perdiendo velocidad EN SU PISTA, y solo en el
  // último tramo cae hacia el anillo de números — con un pequeño rebote al final.
  useEffect(() => {
    if (winningNumber === null || winningNumber === undefined) return;

    const elapsed = spinStartedAt.current ? Date.now() - spinStartedAt.current : MIN_SPIN_MS;
    const waitBeforeSettling = Math.max(0, MIN_SPIN_MS - elapsed);

    const settleTimer = setTimeout(() => {
      stopTicking();
      setRotation((current) => {
        const pocketIndex = WHEEL_ORDER.indexOf(winningNumber);
        const pocketAngle = pocketIndex * SLICE_ANGLE + SLICE_ANGLE / 2; // centro de la casilla, no el borde
        const currentMod = ((current % 360) + 360) % 360;
        return current - currentMod + 360 * 4 + (360 - pocketAngle);
      });
      setBallRotation((current) => {
        const currentMod = ((current % 360) + 360) % 360;
        return current - currentMod - 360 * 3;
      });
      setRadiusTransitionSeconds(0);
      setPhase('settle');
    }, waitBeforeSettling);

    const dropTimer = setTimeout(() => {
      setRadiusTransitionSeconds(RADIUS_DROP_SECONDS);
      setBallRadius(BALL_LANDED_RADIUS);
    }, waitBeforeSettling + SETTLE_MS * RADIUS_DROP_SHARE);

    const doneTimer = setTimeout(() => {
      setLanded(true);
      setBouncing(true);
      onSettled && onSettled();
      const bounceTimer = setTimeout(() => setBouncing(false), 420);
      timers.current.push(bounceTimer);
    }, waitBeforeSettling + SETTLE_MS);

    timers.current.push(settleTimer, dropTimer, doneTimer);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningNumber]);

  useEffect(
    () => () => {
      clearTimers();
      stopTicking();
    },
    []
  );

  const wheelTransition =
    phase === 'spin'
      ? `transform ${TICK_MS}ms linear`
      : phase === 'settle'
      ? `transform ${SETTLE_SECONDS}s cubic-bezier(0.16, 1, 0.3, 1)`
      : 'none';

  const ballRotationTransition =
    phase === 'spin'
      ? `transform ${TICK_MS}ms linear`
      : phase === 'settle'
      ? `transform ${SETTLE_SECONDS}s cubic-bezier(0.16, 1, 0.3, 1)`
      : 'none';

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

      {/* capa ESTÁTICA: el aro y la pista de la bola no giran, solo la rueda numerada gira debajo */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={CENTER} cy={CENTER} r={TRACK_MID_R} fill="none" stroke="var(--line)" strokeWidth={TRACK_WIDTH} />
        <circle cx={CENTER} cy={CENTER} r={RIM_R} fill="none" stroke="var(--gold)" strokeWidth="2" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TRACK_MID_R - TRACK_WIDTH / 2}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1"
          opacity="0.4"
        />
      </svg>

      {/* rueda numerada: gira de forma independiente de la pista/bola */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${rotation}deg)`,
          transition: wheelTransition,
        }}
      >
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
        <circle cx={CENTER} cy={CENTER} r={WEDGE_INNER_R - 2} fill="var(--felt-2)" stroke="var(--gold)" strokeWidth="1.5" />
      </svg>

      {/* bolita: gira independiente en su pista y cae hacia el anillo de números */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${ballRotation}deg)`,
          transition: ballRotationTransition,
        }}
      >
        <g className={bouncing ? 'ball-bounce' : ''}>
          <circle
            cx={CENTER}
            cy={CENTER - ballRadius}
            r="5.5"
            fill="var(--parchment)"
            style={{
              transition: radiusTransitionSeconds
                ? `cy ${radiusTransitionSeconds}s cubic-bezier(0.4, 0, 0.6, 1)`
                : 'none',
            }}
          />
        </g>
      </svg>

      {landed && winningNumber !== null && winningNumber !== undefined && (
        <div className="wheel-result-badge">
          <span className="mono wheel-result-number" style={{ color: resultTextColor(winningNumber) }}>
            {winningNumber}
          </span>
          <span className="text-sage wheel-result-label">{resultLabel(winningNumber)}</span>
        </div>
      )}
    </div>
  );
}
