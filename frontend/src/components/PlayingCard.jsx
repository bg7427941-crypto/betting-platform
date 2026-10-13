const SUIT_NAMES = { '♥': 'corazones', '♦': 'diamantes', '♣': 'tréboles', '♠': 'picas' };
const SUIT_PATHS = {
  '♥': 'M40 65C-8 34 17 3 40 26c23-23 48 8 0 39z',
  '♦': 'M40 10l24 30-24 30-24-30z',
  '♠': 'M40 12c-5 8-28 22-28 35 0 17 21 17 26 5l-7 16h18l-7-16c5 12 26 12 26-5 0-13-23-27-28-35z',
  '♣': 'M37 49l-7 19h20l-7-19M40 14a14 14 0 0 0-12 22c-22-7-26 28-7 28 9 0 15-7 19-14 4 7 10 14 19 14 19 0 15-35-7-28a14 14 0 0 0-12-22z',
};
const PAIRS = (ys) =>
  ys.flatMap((y) => [
    [23, y],
    [57, y],
  ]);
const PIPS = {
  A: [[40, 56]],
  2: [
    [40, 27],
    [40, 85],
  ],
  3: [
    [40, 24],
    [40, 56],
    [40, 88],
  ],
  4: PAIRS([28, 84]),
  5: [...PAIRS([28, 84]), [40, 56]],
  6: PAIRS([24, 56, 88]),
  7: [...PAIRS([24, 56, 88]), [40, 40]],
  8: [...PAIRS([24, 56, 88]), [40, 40], [40, 72]],
  9: [...PAIRS([22, 44, 68, 90]), [40, 56]],
  10: [...PAIRS([20, 43, 69, 92]), [40, 32], [40, 80]],
};

export default function PlayingCard({ card, delay = 0, flip = false, small = false }) {
  if (!card) return null;
  const hidden = card.hidden;
  const red = card.suit === '♥' || card.suit === '♦';
  const rankName = { A: 'As', K: 'Rey', Q: 'Reina', J: 'Jota' }[card.rank] || card.rank;
  return (
    <div
      role="img"
      aria-label={hidden ? 'Carta boca abajo' : `${rankName} de ${SUIT_NAMES[card.suit]}`}
      className={`bj-card ${hidden ? 'bj-card-back' : red ? 'text-brick' : ''} ${flip ? 'bj-card-flip' : 'bj-card-deal'} ${small ? 'bj-card-sm' : ''}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {hidden ? (
        <div className="bj-card-back-crest" aria-hidden="true">
          <span>P</span>
          <small>PALCO</small>
        </div>
      ) : (
        <>
          <span className="bj-card-corner" aria-hidden="true">
            <b>{card.rank}</b>
            <span>{card.suit}</span>
          </span>
          <svg className="bj-card-art" viewBox="0 0 80 112" aria-hidden="true">
            {PIPS[card.rank] ? (
              PIPS[card.rank].map(([x, y], i) => (
                <path
                  key={i}
                  d={SUIT_PATHS[card.suit]}
                  fill="currentColor"
                  transform={`translate(${x} ${y}) rotate(${y > 56 ? 180 : 0}) scale(${card.rank === 'A' ? 0.65 : 0.28}) translate(-40 -40)`}
                />
              ))
            ) : (
              <>
                <rect
                  x="13"
                  y="17"
                  width="54"
                  height="78"
                  rx="24"
                  fill="none"
                  stroke="#c39b52"
                  strokeWidth="1"
                />
                <path d="M26 33l6 6 8-13 8 13 6-6-3 18H29z" fill="#c39b52" />
                <text
                  x="40"
                  y="77"
                  textAnchor="middle"
                  fontFamily="Georgia,serif"
                  fontSize="29"
                  fill="currentColor"
                >
                  {card.rank}
                </text>
                <path d="M29 86h22" stroke="#c39b52" />
              </>
            )}
          </svg>
          <span className="bj-card-corner bj-card-corner-bottom" aria-hidden="true">
            <b>{card.rank}</b>
            <span>{card.suit}</span>
          </span>
        </>
      )}
    </div>
  );
}
