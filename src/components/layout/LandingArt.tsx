/**
 * The public landing's picture (green board, founder 2026-10-28): a
 * neighbourhood at dusk behind a dark scrim, so the hero line reads. Until
 * the founder supplies a licensed photograph this is a drawn scene in the
 * brand's own tokens: nothing on it is a real person or place, and nothing
 * is pulled from the concept board. Decorative: the words carry the page.
 */
export function LandingArt() {
  return (
    <svg className="landing-hero-art" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="landing-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120c19" />
          <stop offset="0.55" stopColor="#3a2154" />
          <stop offset="1" stopColor="#9887ae" />
        </linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#landing-sky)" />
      {/* A distant row of roofs, then nearer houses with lit windows, then the street. */}
      <path d="M0 420l30-26 30 26 20-18 24 18 26-24 30 24 22-16 28 16 26-22 30 22 24-18 30 18 20-14 30 14v60H0z" fill="#2b1b3d" />
      <path d="M-10 500l46-40 46 40v120h-92z" fill="#17101f" />
      <path d="M118 470l60-52 60 52v150H118z" fill="#1d1428" />
      <path d="M270 492l50-44 50 44v128H270z" fill="#17101f" />
      <rect x="14" y="520" width="14" height="18" fill="#f0d08a" opacity="0.85" />
      <rect x="150" y="500" width="16" height="20" fill="#f0d08a" opacity="0.9" />
      <rect x="192" y="500" width="16" height="20" fill="#f0d08a" opacity="0.7" />
      <rect x="300" y="520" width="12" height="16" fill="#f0d08a" opacity="0.8" />
      <rect x="168" y="560" width="22" height="60" rx="2" fill="#2b1b3d" />
      <rect x="0" y="620" width="390" height="224" fill="#120c19" />
      <path d="M0 640h390" stroke="#2b1b3d" strokeWidth="3" />
      <path d="M160 660h70v184h-70z" fill="#1d1428" />
      {/* A canvasser, from behind, walking toward the lit door. */}
      <ellipse cx="236" cy="800" rx="30" ry="6" fill="#0b0710" opacity="0.6" />
      <path d="M222 690c-9 0-16 8-16 18v52h32v-52c0-10-7-18-16-18z" fill="#0f0a15" />
      <circle cx="222" cy="676" r="12" fill="#0f0a15" />
      <path d="M208 712l-10 26M236 712l10 26" stroke="#0f0a15" strokeWidth="6" strokeLinecap="round" />
      <path d="M214 760l-4 36M230 760l4 36" stroke="#0f0a15" strokeWidth="8" strokeLinecap="round" />
      <rect x="238" y="716" width="12" height="16" rx="2" fill="#fbf7f0" opacity="0.9" />
    </svg>
  );
}
