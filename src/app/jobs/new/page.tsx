import Link from "next/link";
import { requireJobEditor } from "@/lib/employer-session";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";

export default async function NewJobPage() {
  await requireJobEditor();
  const jurisdictions = await jurisdictionOptions();
  return (
    <main className="page max-w-3xl">
      <Masthead title="New job">
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Jobs</Link>
      </Masthead>
      <p className="lead">Six short steps. Nothing is saved until the last one, and the draft is published from the job page once every check passes.</p>
      <JobForm jurisdictions={jurisdictions} />
    </main>
  );
}
