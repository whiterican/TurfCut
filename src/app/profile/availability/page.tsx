import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadAvailability } from "@/lib/availability-data";
import { loadSharing } from "@/lib/sharing-data";
import { AUDIENCE_OPTIONS } from "@/lib/sharing";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { withoutPastDates } from "@/lib/availability";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";
import { ReadingPage } from "@/components/layout/Page";

export default async function AvailabilityPage() {
  const { workerId } = await requireWorker();
  const [{ availability }, sharing] = await Promise.all([loadAvailability(workerId), loadSharing(workerId)]);
  const audience = AUDIENCE_OPTIONS.find((o) => o.value === sharing.choices.audiences.availability)!;

  return (
    <ReadingPage gap={8}>
      <div className="space-y-3">
        <Masthead title="Availability">
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Profile</Link>
        </Masthead>
        <p className="lead">When you&apos;re usually free to work. It helps schedulers plan; it&apos;s never scored or used to rank you.</p>
        <p className="text-hint">
          Who sees it: {audience.label}.{" "}
          <Link href="/profile/sharing" className="link">Change</Link>
        </p>
      </div>
      {/* Past dates drop off here too, so the form's rows match what saving keeps. */}
      <AvailabilityForm availability={withoutPastDates(availability, new Date().toISOString().slice(0, 10))} />
    </ReadingPage>
  );
}
