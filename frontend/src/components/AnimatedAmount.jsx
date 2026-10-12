import { useEffect, useRef } from 'react';
import { formatCents } from '../context/WalletContext';
import { useReducedMotion } from '../lib/useReducedMotion';

// Only the amount's text changes on each frame; the slot machine stays untouched.
export default function AnimatedAmount({ cents, duration = 1100 }) {
  const element = useRef(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const node = element.current;
    if (reducedMotion) {
      node.textContent = formatCents(cents);
      return;
    }
    const started = performance.now();
    let frame;
    let previous;
    function tick(now) {
      const progress = Math.min(1, (now - started) / duration);
      const amount = formatCents(Math.round(cents * (1 - (1 - progress) ** 3)));
      if (amount !== previous) {
        node.textContent = amount;
        previous = amount;
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents, duration, reducedMotion]);
  return (
    <span ref={element} aria-label={formatCents(cents)}>
      {formatCents(reducedMotion ? cents : 0)}
    </span>
  );
}
