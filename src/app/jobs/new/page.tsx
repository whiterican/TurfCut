import Link from "next/link";
import { requireEmployer } from "@/lib/employer-session";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";

export default async function NewJobPage() {
  await requireEmployer();
  const jurisdictions = await jurisdictionOptions();
  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Job builder</p>
          <h1 className="page-title">New job</h1>
        </div>
        <Link href="/jobs" className="btn-ghost">← Jobs</Link>
      </header>
      <p className="lead">Saved as a draft. You publish it from the job page once every check passes.</p>
      <JobForm jurisdictions={jurisdictions} />
    </main>
  );
}
