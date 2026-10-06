import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadAvailability } from "@/lib/availability-data";
import { loadSharing } from "@/lib/sharing-data";
import { AUDIENCE_OPTIONS } from "@/lib/sharing";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { withoutPastDates } from "@/lib/availability";

export default async function AvailabilityPage() {
  const { workerId } = await requireWorker();
  const [{ availability }, sharing] = await Promise.all([loadAvailability(workerId), loadSharing(workerId)]);
  const audience = AUDIENCE_OPTIONS.find((o) => o.value === sharing.choices.audiences.availability)!;

  return (
    <main className="page max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Availability</h1>
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <p className="lead">When you&apos;re usually free to work. It helps schedulers plan; it&apos;s never scored or used to rank you.</p>
        <p className="text-hint">
          Who sees it: {audience.label}.{" "}
          <Link href="/profile/sharing" className="link">Change</Link>
        </p>
      </header>
      {/* Past dates drop off here too, so the form's rows match what saving keeps. */}
      <AvailabilityForm availability={withoutPastDates(availability, new Date().toISOString().slice(0, 10))} />
    </main>
  );
}
