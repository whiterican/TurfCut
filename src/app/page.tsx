import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";

const POINTS = [
  { title: "Proof, not résumés.", body: "Verified experience follows workers from project to project." },
  { title: "Fit without inference.", body: "Political alignment is self-reported, optional and consent-governed." },
  { title: "One operating layer.", body: "Hiring, field work and payouts in one connected workflow." },
];

export default async function Home() {
  const session = await getSessionProfile();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-12 pb-28 sm:px-6 sm:pt-20 lg:pb-16">
      <div className="max-w-2xl space-y-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="badge-lime font-sans tracking-normal normal-case">Private pilot</span>
          Field teams, assembled better
        </p>
        <h1 className="text-5xl leading-[0.95] font-bold tracking-[-0.045em] text-fg sm:text-7xl">
          The ground game gets a real labor market.
        </h1>
        <p className="lead max-w-xl">
          Turfcut connects experienced petitioners and canvassers with the campaigns that need them — then makes every
          match, shift and payout easier to trust.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          {session ? (
            <Link href="/dashboard" className="btn-primary px-6">
              Go to dashboard →
            </Link>
          ) : (
            <>
              <Link href="/signup" className="btn-primary px-6">
                Get started →
              </Link>
              <Link href="/login" className="btn-secondary px-6">
                Log in
              </Link>
            </>
          )}
        </div>
      </div>

      <ul className="mt-16 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="space-y-2">
            <p className="text-lg font-bold tracking-[-0.01em] text-fg">{p.title}</p>
            <p className="text-muted-sm leading-relaxed">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-hint mt-12">Petition circulation first, canvassing next. Patent pending.</p>
    </main>
  );
}
