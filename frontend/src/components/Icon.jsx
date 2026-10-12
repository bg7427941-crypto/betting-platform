const paths = {
  sports: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 3-2 3 2-1 4h-4l-1-4ZM12 3v4m8 1-5 1m2 10-3-6M7 19l3-6M4 8l5 1" />
    </>
  ),
  casino: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="m12 7 4 5-4 5-4-5 4-5Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7" />
      <path d="M20 12h-5v4h5M16.5 14h.01" />
    </>
  ),
  admin: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  moon: <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />,
  logout: (
    <>
      <path d="M10 4H5v16h5m-1-8h12m-4-4 4 4-4 4" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10 5a12 12 0 0 1 12 7 16 16 0 0 1-3 4M6 6a16 16 0 0 0-4 6s3.5 7 10 7a11 11 0 0 0 5-1M10 10a3 3 0 0 0 4 4" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Z" />
      <path d="M13 5v2m0 3v2m0 3v2m0 2v1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5m-6 6 6-6 6 6" />,
  down: <path d="M12 5v14m-6-6 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  live: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] || paths.casino}
    </svg>
  );
}
