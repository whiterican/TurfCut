import Link from "next/link";
import { requireJobEditor } from "@/lib/employer-session";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";
import { ReadingPage } from "@/components/layout/Page";

export default async function NewJobPage() {
  await requireJobEditor();
  const jurisdictions = await jurisdictionOptions();
  return (
    <ReadingPage org head={<Masthead title="New job">
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Jobs</Link>
      </Masthead>}>
      <p className="lead">Six short steps. Your draft saves as you go, from the first step, and is published from the job page once every check passes.</p>
      <JobForm jurisdictions={jurisdictions} />
    </ReadingPage>
  );
}
