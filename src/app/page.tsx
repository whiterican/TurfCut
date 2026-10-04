import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";

const POINTS = [
  { title: "Proof, not résumés", body: "Verified work follows you from job to job." },
  { title: "Fit without inference", body: "Political fit is yours to share — or not." },
  { title: "One place to work", body: "Jobs, shifts and pay, connected." },
];

// Illustrative numbers (labelled "Example" on the page), not a real worker.
const EXAMPLE = [
  { label: "Signatures per active hour", value: "14.2", math: "568 signatures ÷ 40 verified hours" },
  { label: "Signature acceptance rate", value: "91%", math: "517 accepted of 568 reviewed" },
  { label: "Show rate", value: "96%", math: "24 of 25 scheduled shifts worked" },
];

export default async function Home() {
  const session = await getSessionProfile();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pt-12 pb-28 text-center sm:px-6 lg:pb-16">
      <span className="badge-lilac">Private pilot</span>
      <h1 className="mt-5 text-[2.75rem] leading-[0.98] font-bold tracking-[-0.045em] text-balance text-fg sm:text-6xl">
        The ground game gets a real labor market.
      </h1>
      <p className="lead mt-5 max-w-md text-balance">
        Petitioners and canvassers meet the campaigns that need them — with every shift and payout easy to trust.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        {session ? (
          <Link href="/dashboard" className="btn-primary px-8">
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/signup" className="btn-primary px-8">
              Get started
            </Link>
            <Link href="/login" className="btn-secondary px-8">
              Log in
            </Link>
          </>
        )}
      </div>

      {/* The thesis is proof: show what a verified scorecard looks like. Clearly an example. */}
      <section aria-labelledby="example-title" className="hero-card hero-card-plain mt-12 w-full max-w-md space-y-4 text-left">
        <p className="eyebrow" id="example-title">Example scorecard · petition circulator</p>
        <dl className="space-y-3">
          {EXAMPLE.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-3 first:border-0 first:pt-0">
              <dt className="min-w-0">
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="hero-muted block text-xs">{m.math}</span>
              </dt>
              <dd className="shrink-0 text-2xl font-bold tabular-nums">{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="hero-muted text-xs">Every number shows its math. Only shifts a supervisor verified count — and there&apos;s no overall score, ever.</p>
      </section>

      <ul className="mt-10 grid w-full gap-3 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="card-flat space-y-1 py-5">
            <p className="font-bold text-fg">{p.title}</p>
            <p className="text-muted-sm">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-hint mt-10">Petition circulation first, canvassing next.</p>
    </main>
  );
}
