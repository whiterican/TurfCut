import Link from "next/link";

/** The views of one job's hiring (C3): Applicants and Invites, kept apart (Matches arrive in C3.4). */
export function HiringTabs({ jobId, current, counts }: { jobId: string; current: "applicants" | "invites"; counts: { applicants: number; invites: number } }) {
  const tabs = [
    { key: "applicants" as const, label: "Applicants", n: counts.applicants },
    { key: "invites" as const, label: "Invites", n: counts.invites },
  ];
  return (
    <nav aria-label="Hiring views" className="flex gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/hiring/${jobId}/${t.key}`}
          aria-current={t.key === current ? "page" : undefined}
          className={`filter-chip ${t.key === current ? "filter-chip-solid" : ""}`}
        >
          {t.label} <span className="tabular-nums">{t.n}</span>
        </Link>
      ))}
    </nav>
  );
}
