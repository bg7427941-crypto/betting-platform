import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import * as sound from '../lib/sound';

// Orden real de los números en una ruleta europea (37 casillas)
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function pocketColor(n) {
  if (n === 0) return 'var(--felt-3)';
  return RED_NUMBERS.has(n) ? '#a6483a' : '#202720';
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
const WHEEL_PERIOD_MS = 1600;
const BALL_PERIOD_MS = 1100;
const modulo = (angle) => ((angle % 360) + 360) % 360;

function rotationOf(element) {
  const transform = getComputedStyle(element).transform;
  if (transform === 'none') return 0;
  const matrix = new DOMMatrixReadOnly(transform);
  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}

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
// The 37 pockets stay mounted while the browser animates their shared SVG layer.
const WheelFace = memo(function WheelFace() {
  return WHEEL_ORDER.map((n, i) => {
    const midAngle = i * SLICE_ANGLE + SLICE_ANGLE / 2;
    const [tx, ty] = polarToXY(midAngle, NUMBER_R);
    return (
      <g key={n}>
        <path d={slicePath(i)} fill={pocketColor(n)} stroke="var(--felt)" strokeWidth={0.5} />
        <text
          x={tx}
          y={ty}
          transform={`rotate(${midAngle}, ${tx}, ${ty})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="#f3f4eb"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="2"
          paintOrder="stroke"
        >
          {n}
        </text>
      </g>
    );
  });
});

export function RouletteWheel({ spinning, winningNumber, onSettled }) {
  const wheel = useRef(null);
  const ball = useRef(null);
  const radialBall = useRef(null);
  const startedAt = useRef(null);
  const pose = useRef({ wheel: 0, ball: 0 });
  const settledCallback = useRef(onSettled);
  const reducedMotion = useReducedMotion();
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    settledCallback.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!spinning) {
      startedAt.current = null;
      return;
    }
    const wheelNode = wheel.current;
    const ballNode = ball.current;
    const radialNode = radialBall.current;
    startedAt.current ??= performance.now();
    setLanded(false);
    radialNode.style.transform = `translateY(-${BALL_TRACK_RADIUS}px)`;

    const animations = [];
    const timers = [];
    let tickInterval;
    let disposed = false;
    const animate = (node, frames, options) => {
      const animation = node.animate(frames, options);
      animations.push(animation);
      return animation;
    };
    const finish = (wheelAngle) => {
      if (disposed) return;
      pose.current = { wheel: modulo(wheelAngle), ball: 0 };
      wheelNode.style.transform = `rotate(${pose.current.wheel}deg)`;
      ballNode.style.transform = 'rotate(0deg)';
      radialNode.style.transform = `translateY(-${BALL_LANDED_RADIUS}px)`;
      animations.forEach((animation) => animation.cancel());
      setLanded(true);
      sound.playBallLand();
      settledCallback.current?.();
    };

    const pocketIndex = WHEEL_ORDER.indexOf(winningNumber);
    const hasResult = pocketIndex >= 0;
    const targetAngle = hasResult ? 360 - (pocketIndex * SLICE_ANGLE + SLICE_ANGLE / 2) : 0;
    if (reducedMotion || !wheelNode.animate) {
      if (hasResult) {
        timers.push(
          setTimeout(
            () => finish(targetAngle),
            Math.max(0, MIN_SPIN_MS - (performance.now() - startedAt.current)) + 500
          )
        );
      }
    } else {
      const wheelSpin = animate(
        wheelNode,
        [
          { transform: `rotate(${pose.current.wheel}deg)` },
          { transform: `rotate(${pose.current.wheel + 360}deg)` },
        ],
        { duration: WHEEL_PERIOD_MS, iterations: Infinity, easing: 'linear' }
      );
      const ballSpin = animate(
        ballNode,
        [
          { transform: `rotate(${pose.current.ball}deg)` },
          { transform: `rotate(${pose.current.ball - 360}deg)` },
        ],
        { duration: BALL_PERIOD_MS, iterations: Infinity, easing: 'linear' }
      );
      tickInterval = setInterval(sound.playBallTick, 120);

      if (hasResult)
        timers.push(
          setTimeout(
            () => {
              clearInterval(tickInterval);
              const wheelFrom = rotationOf(wheelNode);
              const ballFrom = rotationOf(ballNode);
              wheelNode.style.transform = `rotate(${wheelFrom}deg)`;
              ballNode.style.transform = `rotate(${ballFrom}deg)`;
              wheelSpin.cancel();
              ballSpin.cancel();
              const wheelTo = wheelFrom + 360 + modulo(targetAngle - wheelFrom);
              // The easing starts at 1.6× its average speed. Match that speed
              // to the continuous loop so braking never accelerates the wheel.
              const settleMs = ((wheelTo - wheelFrom) / 360) * WHEEL_PERIOD_MS * 1.6;
              const ballTurns = Math.max(1, Math.floor(settleMs / BALL_PERIOD_MS / 1.6));
              const ballTo = ballFrom - 360 * ballTurns - modulo(ballFrom);
              const options = {
                duration: settleMs,
                easing: 'cubic-bezier(0.25, 0.4, 0.4, 1)',
                fill: 'forwards',
              };
              const braking = animate(
                wheelNode,
                [{ transform: `rotate(${wheelFrom}deg)` }, { transform: `rotate(${wheelTo}deg)` }],
                options
              );
              animate(
                ballNode,
                [{ transform: `rotate(${ballFrom}deg)` }, { transform: `rotate(${ballTo}deg)` }],
                {
                  ...options,
                  easing: `cubic-bezier(0.25, ${(settleMs * 360 * 0.25) / BALL_PERIOD_MS / (ballFrom - ballTo)}, 0.4, 1)`,
                }
              );
              animate(
                radialNode,
                [
                  { transform: `translateY(-${BALL_TRACK_RADIUS}px)` },
                  { transform: `translateY(-${BALL_LANDED_RADIUS}px)` },
                ],
                {
                  duration: settleMs * 0.45,
                  delay: settleMs * 0.55,
                  easing: 'ease-in-out',
                  fill: 'forwards',
                }
              );
              for (const portion of [0.03, 0.08, 0.14, 0.22, 0.32, 0.45, 0.61, 0.8, 0.94])
                timers.push(setTimeout(sound.playBallTick, portion * settleMs));
              braking.finished.then(() => finish(wheelTo)).catch(() => {});
            },
            Math.max(0, MIN_SPIN_MS - (performance.now() - startedAt.current))
          )
        );
    }

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      clearInterval(tickInterval);
      pose.current = { wheel: rotationOf(wheelNode), ball: rotationOf(ballNode) };
      wheelNode.style.transform = `rotate(${pose.current.wheel}deg)`;
      ballNode.style.transform = `rotate(${pose.current.ball}deg)`;
      animations.forEach((animation) => animation.cancel());
    };
  }, [spinning, winningNumber, reducedMotion]);

  return (
    <div className="roulette-wheel" data-spinning={spinning}>
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
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ position: 'absolute', inset: 0 }}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TRACK_MID_R}
          fill="none"
          stroke="var(--line)"
          strokeWidth={TRACK_WIDTH}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RIM_R}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2"
        />
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
        ref={wheel}
        className="roulette-rotor"
        style={{ position: 'absolute', inset: 0 }}
      >
        <WheelFace />
        {landed && WHEEL_ORDER.includes(winningNumber) && (
          <path
            d={slicePath(WHEEL_ORDER.indexOf(winningNumber))}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="3"
          />
        )}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={WEDGE_INNER_R - 2}
          fill="var(--felt-2)"
          stroke="var(--gold)"
          strokeWidth="1.5"
        />
      </svg>

      {/* bolita: gira independiente en su pista y cae hacia el anillo de números */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        ref={ball}
        className="roulette-ball-orbit"
        style={{ position: 'absolute', inset: 0 }}
      >
        <g ref={radialBall} className="roulette-ball-radial">
          <circle cx={CENTER} cy={CENTER} r="5.5" fill="var(--parchment)" />
        </g>
      </svg>

      {landed && winningNumber !== null && winningNumber !== undefined && (
        <div className="wheel-result-badge">
          <span
            className="mono wheel-result-number"
            style={{ color: resultTextColor(winningNumber) }}
          >
            {winningNumber}
          </span>
          <span className="text-sage wheel-result-label">{resultLabel(winningNumber)}</span>
        </div>
      )}
    </div>
  );
}
