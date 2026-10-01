import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { FIELD_ROLES, SCHEDULING_ROLES } from "@/lib/access";
import { readSupportContacts } from "@/lib/jobs";
import { readTurf, shiftProgress, shiftState } from "@/lib/field-day";
import { facts, loadShift } from "@/lib/field-day-data";
import { ShiftProgress } from "@/components/ShiftProgress";
import { TurfMap } from "@/components/TurfMap";
import { LocalTime } from "@/components/LocalTime";
import { ActionButton } from "@/components/ActionButton";
import { CheckInButton, OnShiftActions } from "@/components/FieldDayActions";
import { Row } from "@/components/Row";
import { supervisorStep, workerStep } from "../actions";

const EVENT_LABELS: Record<string, string> = {
  CHECK_IN: "Checked in",
  CHECK_OUT: "Checked out",
  PAUSE_START: "Break started",
  PAUSE_END: "Break ended",
  PACKET_PICKUP: "Packet handed out",
  PACKET_RETURN: "Packet returned",
  SIGNATURE_SUBMITTED: "Signatures logged",
  DOOR_KNOCK: "Doors logged",
  CONTACT: "Contacts logged",
  BATCH_COUNT: "Batch counted",
  SHIFT_CANCELLED: "Shift cancelled",
  INCIDENT: "Incident reported",
  CORRECTION: "Correction",
  NOTE: "Note",
};

function eventDetail(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "CHECK_IN":
      return p.atStaging === true ? "at staging" : p.atStaging === false ? `away from staging (${p.distance})` : "location not checked";
    case "PACKET_PICKUP":
      return `${p.packetId} · ${p.sheets} sheets`;
    case "PACKET_RETURN":
      return `${p.packetId} · ${p.sheetsReturned} sheets · ${p.signatures} signatures claimed`;
    case "SIGNATURE_SUBMITTED":
    case "DOOR_KNOCK":
    case "CONTACT":
      return `+${p.count ?? 1}`;
    case "BATCH_COUNT":
      return `${p.accepted} accepted · ${p.rejected} rejected of ${p.reviewed} reviewed${p.exceptions ? ` · ${p.exceptions}` : ""}`;
    case "SHIFT_CANCELLED":
      return `by ${p.by === "WORKER" ? "the worker" : "the organization"}${p.reason ? ` — ${p.reason}` : ""}`;
    default:
      return "";
  }
}

export default async function ShiftPage({ params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const session = await requireAuth();
  const s = await loadShift(shiftId);
  if (!s) notFound();

  const isWorker = session.role === "WORKER" && session.workerId === s.engagement.workerId;
  const isOrg = session.orgId === s.engagement.job.orgId && [...SCHEDULING_ROLES, ...FIELD_ROLES].includes(session.role);
  if (!isWorker && !isOrg) notFound();
  const canField = isOrg && FIELD_ROLES.includes(session.role);

  const f = facts(s);
  const st = shiftState(f);
  const steps = shiftProgress(f);
  const turf = readTurf(s.turfArea);
  const staging = s.stagingLat !== null && s.stagingLng !== null ? { lat: s.stagingLat, lng: s.stagingLng } : null;
  const contacts = readSupportContacts(s.engagement.job.supportContacts);
  const petition = f.workType === "PETITION";
  const live = !!st.checkedInAt && !st.checkedOutAt;
  const eyebrow = st.cancelled ? "Cancelled" : live ? (st.paused ? "On a break" : "Live shift") : st.checkedOutAt ? "Shift done" : "Upcoming shift";

  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1.5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{isWorker ? "Field day" : s.engagement.worker.displayName}</h1>
          <p className="text-muted-sm">
            <Link href={`/jobs/${s.engagement.job.id}`} className="link">{s.engagement.job.title}</Link> · {s.engagement.job.org.name}
          </p>
        </div>
        {live && <span className={st.paused ? "badge-butter" : "badge-mint"}>{st.paused ? "On break" : "On shift"}</span>}
      </header>

      <div className="hero-card space-y-4">
        <p className="eyebrow">
          <LocalTime iso={s.startsAt.toISOString()} mode="date" />
          {s.stagingLocation ? ` · ${s.stagingLocation}` : ""}
        </p>
        <p className="hero-title">
          {petition ? `${st.signatures} signature${st.signatures === 1 ? "" : "s"} submitted` : `${st.doors} doors · ${st.contacts} contacts`}
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="block font-bold">
              <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
            </span>
            <span className="hero-muted">Shift</span>
          </span>
          {petition && (
            <span>
              <span className="block font-bold">{st.packetsOut.length ? st.packetsOut.join(", ") : "—"}</span>
              <span className="hero-muted">Packets out</span>
            </span>
          )}
        </p>
      </div>

      {isWorker && !st.cancelled && !st.checkedOutAt && (
        <section className="card space-y-4">
          {!st.checkedInAt ? (
            <>
              <CheckInButton shiftId={s.id} hasStaging={!!staging} />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">Can&apos;t make it?</summary>
                <div className="pt-3">
                  <ActionButton action={workerStep} fields={{ shiftId: s.id, kind: "cancel" }} label="Cancel shift" variant="btn-secondary">
                    <label className="min-w-48 flex-1 space-y-1.5">
                      <span className="label">Reason</span>
                      <input name="reason" className="field" required maxLength={200} />
                    </label>
                  </ActionButton>
                  <p className="text-hint pt-2">Cancelling inside the job&apos;s notice window counts as a no-show on your scorecard.</p>
                </div>
              </details>
            </>
          ) : (
            <OnShiftActions shiftId={s.id} workType={f.workType} paused={st.paused} packetsOut={st.packetsOut} />
          )}
        </section>
      )}

      {canField && !st.cancelled && (
        <section className="section">
          <h2 className="section-title">Supervisor</h2>
          <div className="card space-y-5">
            {petition && live && (
              <ActionButton action={supervisorStep} fields={{ shiftId: s.id, kind: "packet_pickup" }} label="Hand out packet">
                <label className="w-32 space-y-1.5">
                  <span className="label">Packet ID</span>
                  <input name="packetId" className="field" required maxLength={40} placeholder="18A" />
                </label>
                <label className="w-24 space-y-1.5">
                  <span className="label">Sheets</span>
                  <input name="sheets" inputMode="numeric" pattern="[0-9]*" className="field" required />
                </label>
              </ActionButton>
            )}
            {st.checkedOutAt && petition && (
              <ActionButton action={supervisorStep} fields={{ shiftId: s.id, kind: "batch_count" }} label={st.batchCounted ? "Record a recount" : "Record batch count"} variant="btn-secondary">
                {[["reviewed", "Reviewed"], ["accepted", "Accepted"], ["rejected", "Rejected"]].map(([k, l]) => (
                  <label key={k} className="w-24 space-y-1.5">
                    <span className="label">{l}</span>
                    <input name={k} inputMode="numeric" pattern="[0-9]*" className="field" required />
                  </label>
                ))}
                <label className="min-w-40 flex-1 space-y-1.5">
                  <span className="label">Exceptions</span>
                  <input name="exceptions" className="field" maxLength={500} placeholder="optional" />
                </label>
              </ActionButton>
            )}
            {st.checkedOutAt && (
              <div className="flex flex-wrap items-start gap-3">
                <ActionButton action={supervisorStep} fields={{ shiftId: s.id, kind: "closeout", status: "APPROVED" }} label="Approve shift" />
                <ActionButton action={supervisorStep} fields={{ shiftId: s.id, kind: "closeout", status: "REJECTED" }} label="Not approved" variant="btn-secondary">
                  <label className="min-w-48 flex-1 space-y-1.5">
                    <span className="label">Reason (shown to the worker)</span>
                    <input name="reason" className="field" required maxLength={500} />
                  </label>
                </ActionButton>
              </div>
            )}
            {!st.checkedInAt && (
              <ActionButton action={supervisorStep} fields={{ shiftId: s.id, kind: "cancel" }} label="Cancel shift" variant="btn-secondary">
                <label className="min-w-48 flex-1 space-y-1.5">
                  <span className="label">Reason (shown to the worker)</span>
                  <input name="reason" className="field" required maxLength={200} />
                </label>
              </ActionButton>
            )}
            {live && !petition && <p className="text-muted-sm">The worker is on shift. Review opens when they check out.</p>}
            <p className="text-hint">Every entry is permanent and records who made it. A later review or recount supersedes an earlier one.</p>
          </div>
        </section>
      )}

      <ShiftProgress steps={steps} />

      {(turf || staging) && (
        <section className="section">
          <h2 className="section-title">Turf</h2>
          <TurfMap turf={turf} staging={staging} />
          {s.stagingLocation && <p className="text-muted-sm">Check in at {s.stagingLocation}.</p>}
        </section>
      )}

      {isOrg && s.events.length > 0 && (
        <section className="section">
          <h2 className="section-title">Custody and activity log</h2>
          <ol className="list-card">
            {s.events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                <span>
                  <span className="font-semibold text-fg">{EVENT_LABELS[e.type] ?? e.type}</span>{" "}
                  <span className="text-muted">{eventDetail(e.type, e.payload)}</span>
                </span>
                <span className="text-xs text-subtle">
                  {e.actorId === null ? "" : e.actorId === s.engagement.worker.profileId ? "Worker · " : "Organization · "}
                  <LocalTime iso={e.createdAt.toISOString()} mode="time" />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {contacts && (
        <section className="section">
          <h2 className="section-title">Who handles problems</h2>
          <dl className="list-card">
            <Row label="Emergencies">{contacts.emergency}</Row>
            <Row label="Pay disputes">{contacts.disputes}</Row>
            <Row label="Lost materials">{contacts.lostMaterials}</Row>
          </dl>
        </section>
      )}
    </main>
  );
}
