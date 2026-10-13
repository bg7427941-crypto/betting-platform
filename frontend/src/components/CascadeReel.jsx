import { useEffect, useRef, useState } from 'react';
import { SlotSymbol } from './SlotArtwork';
import * as sound from '../lib/sound';

export default function CascadeReel({
  reel,
  spinning,
  result,
  display,
  frame,
  turbo,
  reducedMotion,
  artworkId,
  hitCells,
  scatter,
  onStopped,
}) {
  const tiles = useRef([]);
  const removed = useRef([]);
  const callback = useRef(onStopped);
  const [moving, setMoving] = useState(false);
  callback.current = onStopped;
  const removedRows = new Set(
    frame.removedCells.filter((cell) => cell.reel === reel).map((cell) => cell.row)
  );
  const survivors = [0, 1, 2].filter((row) => !removedRows.has(row));
  const replacementCount = 3 - survivors.length;
  const origins = [
    ...Array.from({ length: replacementCount }, (_, row) => row - replacementCount),
    ...survivors,
  ];

  useEffect(() => {
    if (!spinning) {
      setMoving(false);
      return;
    }
    setMoving(true);
    let disposed = false;
    const animations = [];
    const pop = reducedMotion ? 0 : turbo ? 160 : 260;
    const duration = reducedMotion ? 300 : turbo ? 340 : 600;
    const delay = reel * (turbo ? 25 : 45);
    removed.current.filter(Boolean).forEach((node) => {
      if (node.animate && !reducedMotion)
        animations.push(
          node.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.75)' },
            ],
            { duration: pop, easing: 'ease-in', fill: 'forwards' }
          )
        );
    });
    tiles.current.filter(Boolean).forEach((node, row) => {
      if (!node.animate) return;
      const frames = reducedMotion
        ? [{ opacity: 0.35 }, { opacity: 1 }]
        : [
            { transform: `translateY(${(origins[row] - row) * 100}%)` },
            { transform: 'translateY(0%)' },
          ];
      animations.push(
        node.animate(frames, {
          duration,
          delay: pop + delay,
          easing: 'cubic-bezier(.25,.6,.4,1)',
          fill: 'both',
        })
      );
    });
    const timer = setTimeout(
      () => {
        if (disposed) return;
        setMoving(false);
        if (removedRows.size) sound.playReelStop(reel);
        callback.current(reel);
      },
      pop + delay + duration + 60
    );
    return () => {
      disposed = true;
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [spinning, result, frame, reel, turbo, reducedMotion]);

  return (
    <div className="slot-reel slot-cascade-reel" data-phase={moving ? 'falling' : 'idle'}>
      <div className="slot-reel-rest" style={{ visibility: moving ? 'hidden' : undefined }}>
        {display.map((symbol, row) => (
          <div
            key={row}
            data-symbol={symbol}
            className={`slot-cell ${hitCells.has(`${reel}-${row}`) ? 'slot-cell-hit' : ''} ${scatter && symbol === '💰' ? 'slot-cell-scatter' : ''}`}
          >
            <SlotSymbol symbol={symbol} artworkId={artworkId} />
          </div>
        ))}
      </div>
      <div
        className="slot-cascade-layer"
        aria-hidden="true"
        style={{ visibility: moving ? 'visible' : 'hidden' }}
      >
        {result.map((symbol, row) => (
          <div
            key={row}
            ref={(node) => {
              tiles.current[row] = node;
            }}
            className="slot-cascade-tile"
            style={{ top: `${(row / 3) * 100}%` }}
          >
            <SlotSymbol symbol={symbol} artworkId={artworkId} decorative />
          </div>
        ))}
        {display.map(
          (symbol, row) =>
            removedRows.has(row) && (
              <div
                key={`removed-${row}`}
                ref={(node) => {
                  removed.current[row] = node;
                }}
                className="slot-cascade-tile slot-cascade-removed"
                style={{ top: `${(row / 3) * 100}%` }}
              >
                <SlotSymbol symbol={symbol} artworkId={artworkId} decorative />
              </div>
            )
        )}
      </div>
      <div className="slot-reel-shade" aria-hidden="true" />
    </div>
  );
}
