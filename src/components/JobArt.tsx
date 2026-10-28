import type { JobType } from "@/lib/jobs";

/**
 * A job's picture (green board, founder 2026-10-28): one image per work
 * category, the same for every job of that type, until an organization
 * replaces it with its own (later; needs a job image column). Until the
 * founder supplies licensed photographs this is drawn art in the brand's
 * own tokens: a street of doors for canvassing, a clipboard and signatures
 * for petition work. It is decorative: the row's words carry every fact.
 */
export function JobArt({ type, className = "" }: { type: JobType; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden className={`job-art ${className}`.trim()}>
      <rect width="160" height="120" fill="var(--sky)" />
      <rect y="40" width="160" height="80" fill="var(--surface-2)" opacity="0.6" />
      {type === "PETITION" ? (
        <>
          {/* Table, clipboard, a sheet of signature lines. */}
          <rect x="0" y="84" width="160" height="36" fill="var(--shell-bg)" />
          <rect x="34" y="22" width="92" height="76" rx="6" fill="var(--solid)" />
          <rect x="42" y="34" width="76" height="60" rx="3" fill="var(--on-solid)" />
          <rect x="66" y="16" width="28" height="12" rx="4" fill="var(--map-fill)" />
          {[46, 56, 66, 76, 86].map((y) => (
            <rect key={y} x="50" y={y} width={y % 20 === 6 ? 44 : 60} height="3" rx="1.5" fill="var(--selected)" opacity="0.6" />
          ))}
          <path d="M52 92c6-10 10-10 16-4s10 6 18-6" fill="none" stroke="var(--map-fill)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* A street: three houses with doors, a path to the nearest one. */}
          <rect x="0" y="88" width="160" height="32" fill="var(--shell-bg)" />
          <path d="M8 60l26-24 26 24v30H8z" fill="var(--solid)" />
          <path d="M66 54l30-28 30 28v36H66z" fill="var(--map-fill)" />
          <path d="M130 62l20-18 10 9v37h-30z" fill="var(--solid)" />
          <rect x="26" y="70" width="12" height="20" rx="1" fill="var(--map-fill)" />
          <rect x="88" y="66" width="16" height="24" rx="1" fill="var(--map-fill)" />
          <rect x="140" y="72" width="10" height="18" rx="1" fill="var(--map-fill)" />
          <rect x="72" y="60" width="8" height="8" fill="var(--on-solid)" />
          <rect x="112" y="60" width="8" height="8" fill="var(--on-solid)" />
          <path d="M96 90c-10 10-20 20-16 30h40c-6-10-14-20-24-30z" fill="var(--shell-muted)" />
        </>
      )}
    </svg>
  );
}
