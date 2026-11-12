/** Decorative background for the login panel: soft gradient, glows, dot grid, leaves and a shelf of fresh/expiring items. */
export function LoginArt() {
  const leaf = "M0 -120 C 70 -80 90 20 0 120 C -90 20 -70 -80 0 -120 Z";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900" />
      <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-brand-300/20 blur-3xl" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#bbf7d0" fillOpacity="0.16" />
          </pattern>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="m"><rect width="600" height="900" fill="url(#fade)" /></mask>
        </defs>
        <rect width="600" height="900" fill="url(#dots)" mask="url(#m)" />

        {/* big leaves */}
        <g fill="#86efac" fillOpacity="0.10">
          <path d={leaf} transform="translate(500 170) rotate(35) scale(1.5)" />
          <path d={leaf} transform="translate(560 330) rotate(65) scale(1.0)" />
          <path d={leaf} transform="translate(60 720) rotate(-30) scale(1.7)" />
          <path d={leaf} transform="translate(210 830) rotate(-60) scale(1.0)" />
        </g>
        <g stroke="#bbf7d0" strokeOpacity="0.14" strokeWidth="2" strokeLinecap="round">
          <path d="M500 170 L 500 170" />
          <path d="M455 285 Q 500 170 545 55" />
          <path d="M20 850 Q 60 720 110 595" />
        </g>

        {/* shelf of products with freshness rings */}
        <g transform="translate(300 650)">
          <line x1="-250" y1="70" x2="250" y2="70" stroke="#bbf7d0" strokeOpacity="0.22" strokeWidth="3" strokeLinecap="round" />
          <g fill="#bbf7d0" fillOpacity="0.13" stroke="#bbf7d0" strokeOpacity="0.30" strokeWidth="2">
            <rect x="-230" y="10" width="46" height="60" rx="8" />
            <rect x="-170" y="-14" width="40" height="84" rx="8" />
            <rect x="-112" y="22" width="56" height="48" rx="8" />
            <rect x="-38" y="-2" width="44" height="72" rx="8" />
            <rect x="24" y="16" width="52" height="54" rx="8" />
            <rect x="94" y="-10" width="40" height="80" rx="8" />
            <rect x="152" y="26" width="52" height="44" rx="8" />
          </g>
          {/* expiry badges: green = fresh, amber = soon, red = expired */}
          <circle cx="-147" cy="-30" r="9" fill="#22c55e" />
          <circle cx="-10" cy="-18" r="9" fill="#fbbf24" />
          <circle cx="114" cy="-26" r="9" fill="#f87171" fillOpacity="0.9" />
          <circle cx="50" cy="0" r="6" fill="#22c55e" />
        </g>

        {/* calendar card */}
        <g transform="translate(410 120) rotate(6)">
          <rect width="150" height="130" rx="16" fill="#ffffff" fillOpacity="0.08" stroke="#bbf7d0" strokeOpacity="0.28" strokeWidth="2" />
          <rect width="150" height="34" rx="16" fill="#ffffff" fillOpacity="0.10" />
          {Array.from({ length: 15 }).map((_, i) => (
            <circle key={i} cx={22 + (i % 5) * 26.5} cy={62 + Math.floor(i / 5) * 24} r="5.5"
              fill={i === 7 ? "#f87171" : i === 4 || i === 6 ? "#fbbf24" : "#bbf7d0"} fillOpacity={i === 7 || i === 4 || i === 6 ? 0.9 : 0.22} />
          ))}
        </g>
      </svg>
    </div>
  );
}
