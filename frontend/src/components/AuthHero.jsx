export function AuthHero() {
  return (
    <svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      style={{ display: 'block', margin: '0 auto 20px' }}
    >
      {/* rueda de ruleta estilizada */}
      <circle cx="72" cy="80" r="54" fill="none" stroke="var(--line)" strokeWidth="1.5" />
      <circle cx="72" cy="80" r="54" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 6" className="hero-wheel-rim" />
      <circle cx="72" cy="80" r="38" fill="var(--felt-2)" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="72" cy="80" r="5" fill="var(--gold)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
        <line
          key={deg}
          x1={72 + 38 * Math.cos((deg * Math.PI) / 180)}
          y1={80 + 38 * Math.sin((deg * Math.PI) / 180)}
          x2={72 + 54 * Math.cos((deg * Math.PI) / 180)}
          y2={80 + 54 * Math.sin((deg * Math.PI) / 180)}
          stroke={i % 2 === 0 ? 'var(--brick)' : '#141414'}
          strokeWidth="7"
          strokeLinecap="round"
        />
      ))}

      {/* fichas flotando */}
      <g className="hero-chip hero-chip-1">
        <circle cx="152" cy="46" r="16" fill="var(--felt-2)" stroke="var(--gold)" strokeWidth="2" />
        <circle cx="152" cy="46" r="9" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      </g>
      <g className="hero-chip hero-chip-2">
        <circle cx="176" cy="92" r="12" fill="var(--felt-2)" stroke="var(--brick)" strokeWidth="2" />
        <circle cx="176" cy="92" r="6.5" fill="none" stroke="var(--brick)" strokeWidth="1.5" />
      </g>
      <g className="hero-chip hero-chip-3">
        <circle cx="150" cy="126" r="10" fill="var(--felt-2)" stroke="var(--sage)" strokeWidth="2" />
        <circle cx="150" cy="126" r="5" fill="none" stroke="var(--sage)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
