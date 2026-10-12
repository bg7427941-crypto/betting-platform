const SYMBOL_CODES = {
  '7️⃣': 'seven',
  '👑': 'crown',
  '💎': 'gem',
  '⭐': 'star',
  '🔔': 'bell',
  '♥️': 'heart',
  '♠️': 'spade',
  '♣️': 'club',
  '♦️': 'diamond',
  '🃏': 'wild',
  '💰': 'bonus',
};
export const SYMBOL_NAMES = {
  '7️⃣': 'Siete',
  '👑': 'Corona',
  '💎': 'Gema',
  '⭐': 'Estrella',
  '🔔': 'Campana',
  '♥️': 'Corazón',
  '♠️': 'Pica',
  '♣️': 'Trébol',
  '♦️': 'Diamante',
  '🃏': 'Comodín',
  '💰': 'Bono',
};

// One original SVG sprite per machine; the moving reels reuse these paths.
export function SlotArtwork({ id }) {
  const gold = `url(#${id}-gold)`;
  const ruby = `url(#${id}-ruby)`;
  return (
    <svg className="slot-artwork" aria-hidden="true" width="0" height="0">
      <defs>
        <linearGradient id={`${id}-gold`} x2="0.35" y2="1">
          <stop stopColor="#fff0b5" />
          <stop offset="0.45" stopColor="#d5a447" />
          <stop offset="1" stopColor="#936020" />
        </linearGradient>
        <linearGradient id={`${id}-ruby`} x2="0.4" y2="1">
          <stop stopColor="#de6c62" />
          <stop offset="1" stopColor="#872e3d" />
        </linearGradient>
        <symbol id={`${id}-seven`} viewBox="0 0 80 80">
          <path d="M21 16h41v10L41 66H25l24-38H21z" fill="#82303b" transform="translate(0 3)" />
          <path
            d="M21 14h41v10L41 64H25l24-38H21z"
            fill={ruby}
            stroke="#ffe0aa"
            strokeWidth="1.5"
          />
          <path d="M27 19h28" stroke="#fff0d1" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id={`${id}-crown`} viewBox="0 0 80 80">
          <path
            d="M13 27l13 11 14-20 14 20 13-11-6 31H19z"
            fill={gold}
            stroke="#86551e"
            strokeWidth="1.5"
          />
          <path d="M20 51h40M24 56h32" stroke="#fff0b5" strokeWidth="2" />
          <rect x="19" y="58" width="42" height="6" rx="2" fill={gold} stroke="#86551e" />
          <path d="M40 34l5 8-5 8-5-8z" fill={ruby} />
          <circle cx="13" cy="25" r="3" fill={gold} />
          <circle cx="40" cy="16" r="3" fill={gold} />
          <circle cx="67" cy="25" r="3" fill={gold} />
        </symbol>
        <symbol id={`${id}-gem`} viewBox="0 0 80 80">
          <path d="M19 17h42l12 19-33 32L7 36z" fill="#326777" stroke="#1f5362" strokeWidth="1.5" />
          <path d="M19 17l7 19H7zM61 17l-7 19h19z" fill="#7eb5bf" />
          <path d="M19 17h42l-7 19H26z" fill="#c1e8e7" />
          <path d="M26 36h28L40 68z" fill="#65a5b2" />
          <path d="M26 36L40 17l14 19" fill="#e8fafa" />
          <path d="M12 36h56M40 17v12" stroke="#fff" strokeOpacity=".6" />
        </symbol>
        <symbol id={`${id}-star`} viewBox="0 0 80 80">
          <path
            d="M40 12l9 18 21 3-15 15 4 21-19-10-19 10 4-21L10 33l21-3z"
            fill={gold}
            stroke="#936020"
            strokeWidth="1.5"
          />
          <path d="M40 17v29L17 35l17-2z" fill="#fff0b5" opacity=".65" />
          <path d="M40 46l-14 17 3-17-12-11z" fill="#b37c2d" />
        </symbol>
        <symbol id={`${id}-bell`} viewBox="0 0 80 80">
          <circle cx="40" cy="17" r="5" fill={gold} stroke="#936020" />
          <circle cx="40" cy="61" r="7" fill="#936020" />
          <path
            d="M17 56l6-8V34c0-22 34-22 34 0v14l6 8z"
            fill={gold}
            stroke="#936020"
            strokeWidth="1.5"
          />
          <path
            d="M29 31c0-7 4-10 8-11v26"
            fill="none"
            stroke="#fff1be"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect x="16" y="54" width="48" height="6" rx="3" fill={gold} stroke="#936020" />
        </symbol>
        <symbol id={`${id}-heart`} viewBox="0 0 80 80">
          <path
            d="M40 65C-8 34 17 3 40 26c23-23 48 8 0 39z"
            fill={ruby}
            stroke="#852f3e"
            strokeWidth="1.5"
          />
          <path
            d="M20 28c2-5 7-7 12-4"
            fill="none"
            stroke="#f3aca1"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id={`${id}-spade`} viewBox="0 0 80 80">
          <path
            d="M40 12c-5 8-28 22-28 35 0 17 21 17 26 5l-7 16h18l-7-16c5 12 26 12 26-5 0-13-23-27-28-35z"
            fill="#244d44"
            stroke="#153d34"
            strokeWidth="1.5"
          />
          <path d="M22 39l13-13" stroke="#6f9c87" strokeWidth="3" strokeLinecap="round" />
        </symbol>
        <symbol id={`${id}-club`} viewBox="0 0 80 80">
          <path d="M37 49l-7 19h20l-7-19" fill="#244d44" />
          <path
            d="M40 14a14 14 0 0 0-12 22c-22-7-26 28-7 28 9 0 15-7 19-14 4 7 10 14 19 14 19 0 15-35-7-28a14 14 0 0 0-12-22z"
            fill="#244d44"
            stroke="#153d34"
            strokeWidth="1.5"
          />
          <path
            d="M34 22c-3 2-5 5-4 8"
            stroke="#6f9c87"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id={`${id}-diamond`} viewBox="0 0 80 80">
          <path d="M40 10l24 30-24 30-24-30z" fill={ruby} stroke="#852f3e" strokeWidth="1.5" />
          <path d="M40 18L23 40l17-6z" fill="#f3aca1" opacity=".7" />
        </symbol>
        <symbol id={`${id}-wild`} viewBox="0 0 80 80">
          <rect
            x="10"
            y="9"
            width="60"
            height="62"
            rx="11"
            fill="#244d44"
            stroke="#d5a447"
            strokeWidth="2"
          />
          <path d="M22 24l8 7 10-13 10 13 8-7-4 23H26z" fill={gold} />
          <text
            x="40"
            y="62"
            textAnchor="middle"
            fontFamily="Georgia,serif"
            fontWeight="bold"
            fontSize="14"
            letterSpacing="1"
            fill="#ffedb7"
          >
            WILD
          </text>
        </symbol>
        <symbol id={`${id}-bonus`} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="31" fill={gold} stroke="#936020" strokeWidth="2" />
          <circle cx="40" cy="40" r="25" fill="none" stroke="#ffedb7" strokeWidth="1.5" />
          <path d="M26 23l6 5 8-9 8 9 6-5-3 15H29z" fill="#936020" />
          <text
            x="40"
            y="54"
            textAnchor="middle"
            fontFamily="Georgia,serif"
            fontWeight="bold"
            fontSize="12"
            letterSpacing=".5"
            fill="#513918"
          >
            BONO
          </text>
        </symbol>
      </defs>
    </svg>
  );
}

export function SlotSymbol({ symbol, artworkId, decorative = false }) {
  return (
    <svg
      className="slot-symbol-art"
      viewBox="0 0 80 80"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : SYMBOL_NAMES[symbol] || symbol}
      aria-hidden={decorative || undefined}
    >
      <use href={`#${artworkId}-${SYMBOL_CODES[symbol] || 'crown'}`} />
    </svg>
  );
}
