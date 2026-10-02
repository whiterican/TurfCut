import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { FIELD_ROLES, SCHEDULING_ROLES } from "@/lib/access";
import { readSupportContacts } from "@/lib/jobs";
import { activeTime, earningsEstimate, readTurf, shiftProgress, shiftState, turfMarks, turfMarksClosed } from "@/lib/field-day";
import { facts, loadShift } from "@/lib/field-day-data";
import { ShiftProgress } from "@/components/ShiftProgress";
import { TurfMap } from "@/components/TurfMap";
import { LocalTime } from "@/components/LocalTime";
import { LiveShiftStats } from "@/components/LiveShiftStats";
import { ActionButton } from "@/components/ActionButton";
import { FieldDayLive } from "@/components/FieldDayLive";
import { Row } from "@/components/Row";
import { PinLegend, TurfWorkbench } from "@/components/TurfWorkbench";
import { toMapPins } from "@/lib/turf-pins";
import { PIN_CATEGORIES } from "@/lib/field-day";
import { supervisorStep, workerStep } from "../actions";
import { shiftPay } from "@/lib/pay-data";
import { computeShiftPay, money, statusLabel } from "@/lib/pay";
import { verifiedWork } from "@/lib/scorecard";

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
  if (type === "NOTE" && (p.kind === "pin" || p.kind === "unpin" || p.kind === "day_turf")) {
    if (p.kind === "unpin") return "pin removed";
    if (p.kind === "day_turf") return p.polygon ? "worker marked their turf for the day" : "worker cleared their day turf";
    const cat = PIN_CATEGORIES.find((c) => c.value === p.category)?.label ?? "Pin";
    return `${cat}${p.label ? ` — ${p.label}` : ""}`;
  }
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
  const pay = await shiftPay(s.id);
  // Amounts go to the worker and to the field team approving them.
  const seesPay = isWorker || canField;
  const payLabel = pay ? statusLabel(pay.state.status).label : null;
  const steps = shiftProgress(
    f,
    pay
      ? {
          done: pay.state.status === "PAID",
          at: pay.state.paidAt ?? undefined,
          detail: seesPay ? `${money(pay.amountCents)} · ${payLabel}` : payLabel!,
        }
      : st.closeout?.status === "REJECTED"
        ? { done: false, detail: "No pay recorded — the shift wasn't approved" }
        : undefined
  );
  // What approving would record, so the supervisor sees the pay they approve.
  const job0 = s.engagement.job;
  const approvePreview = canField && st.checkedOutAt
    ? computeShiftPay({
        method: job0.compensationMethod,
        rateCents: job0.payRateCents,
        workType: job0.type,
        work: verifiedWork(s.events, s.validations),
        jurisdictionVersion: job0.jurisdiction.version,
      })
    : null;
  const payLocked = !!pay?.locked;
  const turf = readTurf(s.turfArea);
  // Pins and a worker's own day turf are a location trail: the worker and
  // the field team (owners, supervisors) see them; recruiters don't.
  const seesMarks = isWorker || canField;
  const marks = seesMarks ? turfMarks(f.events) : { pins: [], dayTurf: null };
  const logEvents = seesMarks ? s.events : s.events.filter((e) => e.type !== "NOTE");
  const marksOpen = isWorker && turfMarksClosed(f, new Date()) === null;
  const staging = s.stagingLat !== null && s.stagingLng !== null ? { lat: s.stagingLat, lng: s.stagingLng } : null;
  const contacts = readSupportContacts(s.engagement.job.supportContacts);
  const petition = f.workType === "PETITION";
  const live = !!st.checkedInAt && !st.checkedOutAt;
  const eyebrow = st.cancelled ? "Cancelled" : live ? (st.paused ? "On a break" : "Live shift") : st.checkedOutAt ? "Shift done" : "Upcoming shift";

  const started = !!st.checkedInAt;
  const now = new Date();
  // Entries the phone saved offline carry the phone's times: the reviewer
  // sees how many, and how late the latest reached the server.
  const offline = s.events.filter((e) => e.receivedAt);
  const offlineLag = offline.reduce((m, e) => Math.max(m, e.receivedAt!.getTime() - e.createdAt.getTime()), 0);
  const offlineNote = offline.length
    ? `${offline.length === 1 ? "1 entry was" : `${offline.length} entries were`} recorded offline and synced up to ${offlineLag >= 3_600_000 ? `${Math.round(offlineLag / 3_600_000)}h` : `${Math.max(1, Math.round(offlineLag / 60_000))} min`} later. Their times come from the worker's phone — check them before approving.`
    : null;
  const worked = activeTime(f, now);
  const job = s.engagement.job;
  // The worker's own pay only — never shown to anyone else here.
  const estimate = earningsEstimate(job.compensationMethod, job.payRateCents, worked.ms, petition ? st.signatures : st.contacts);
  // Every field action goes through the phone's queue (offline field day):
  // it works with no signal and syncs later.
  const workerActions = isWorker && !st.cancelled && (!st.checkedOutAt || s.endsAt.getTime() > now.getTime() - 24 * 3_600_000) && (
    <FieldDayLive
      shift={{
        shiftId: s.id,
        userId: session.userId,
        workType: f.workType,
        status: f.status,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        staging,
        // Who made each event isn't needed on the phone; the phone's own id
        // for an entry lets it drop that entry once it shows here.
        events: s.events.map((e) => ({ type: e.type, payload: e.payload, clientId: e.clientId, createdAt: e.createdAt.toISOString() })),
        validations: f.validations.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
      }}
      beforeCheckIn={
        <>
          {/* Late cancellations hurt campaigns: a real button, with the consequence up front. Needs a connection. */}
          <details className="group space-y-3">
            <summary className="btn-secondary w-full cursor-pointer list-none">
              <span className="group-open:hidden">Can&apos;t make it</span>
              <span className="hidden group-open:inline">Keep my shift</span>
            </summary>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-fg">Cancel this shift</p>
              <ActionButton action={workerStep} fields={{ shiftId: s.id, kind: "cancel" }} label="Cancel shift" variant="btn-secondary">
                <label className="min-w-48 flex-1 space-y-1.5">
                  <span className="label">Reason</span>
                  <input name="reason" className="field" required maxLength={200} />
                </label>
              </ActionButton>
            </div>
          </details>
          <p className="text-hint">Cancelling inside the job&apos;s notice window counts as a no-show on your scorecard.</p>
        </>
      }
    />
  );


  return (
    <main className="page max-w-2xl">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{isWorker ? "Field day" : s.engagement.worker.displayName}</h1>
          <p className="text-muted-sm">
            <Link href={`/jobs/${s.engagement.job.id}`} className="link">{s.engagement.job.title}</Link> · {s.engagement.job.org.name}
          </p>
        </div>
        {live && <span className={`${st.paused ? "badge-butter" : "badge-mint"} mt-5 shrink-0`}>{st.paused ? "On break" : "On shift"}</span>}
      </header>

      {!started && workerActions}
      <div className={`hero-card space-y-4 ${isWorker ? "hero-card-lime" : ""}`}>
        <p className="eyebrow">
          <LocalTime iso={s.startsAt.toISOString()} mode="date" />
          {started && s.stagingLocation ? ` · ${s.stagingLocation}` : ""}
        </p>
        {started ? (
          <p className="hero-title">
            {petition ? `${st.signatures} signature${st.signatures === 1 ? "" : "s"} submitted` : `${st.doors} doors · ${st.contacts} contacts`}
          </p>
        ) : (
          // Before the shift: when and where, not a zero.
          <p className="hero-title">
            <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
          </p>
        )}
        {started && (
          <LiveShiftStats
            // A fresh clock with every server render (each action refreshes the page).
            key={now.getTime()}
            activeMs={worked.ms}
            running={worked.running}
            maxExtraMs={s.endsAt.getTime() - now.getTime()}
            pay={
              !isWorker || !estimate
                ? null
                : job.compensationMethod === "HOURLY"
                  ? { kind: "hourly", centsPerHour: job.payRateCents!, label: estimate.label }
                  : { kind: "fixed", cents: estimate.cents, label: estimate.label }
            }
          />
        )}
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {started ? (
            <span>
              <span className="block font-bold">
                <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
              </span>
              <span className="hero-muted">Scheduled</span>
            </span>
          ) : (
            s.stagingLocation && (
              <span>
                <span className="block font-bold">{s.stagingLocation}</span>
                <span className="hero-muted">Staging — check in here</span>
              </span>
            )
          )}
          {petition && started && (
            <span>
              <span className="block font-bold">{st.packetsOut.length ? st.packetsOut.join(", ") : "—"}</span>
              <span className="hero-muted">Packets out</span>
            </span>
          )}
        </p>
      </div>

      {started && workerActions}
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
            {st.checkedOutAt && petition && !payLocked && (
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
            {st.checkedOutAt && payLocked && (
              <p className="text-muted-sm">Pay for this shift ({money(pay!.amountCents)}) is approved for payment, so the review and counts are final. Your owner or finance team can make a pay adjustment if something changed.</p>
            )}
            {st.checkedOutAt && !payLocked && offlineNote && <p className="text-sm font-semibold text-danger-msg" role="note">{offlineNote}</p>}
            {st.checkedOutAt && !payLocked && approvePreview && (
              <p className="text-muted-sm" role="note">
                {approvePreview.ok ? (
                  pay && pay.mainCents !== approvePreview.amountCents && st.closeout?.status === "APPROVED" ? (
                    <>The counts changed since approval: recorded pay is {money(pay.mainCents)}, but it now works out to <strong className="text-fg">{money(approvePreview.amountCents)}</strong> ({approvePreview.basis.formula}). Approve again to update it.</>
                  ) : !pay && st.closeout?.status === "APPROVED" ? (
                    <>No pay is recorded for the current approval (a recount after approving withdraws it). <strong className="text-fg">Approve again</strong> to record pay of {money(approvePreview.amountCents)} — {approvePreview.basis.formula}.</>
                  ) : (
                    <>Approving records pay of <strong className="text-fg">{money(approvePreview.amountCents)}</strong> — {approvePreview.basis.formula}.</>
                  )
                ) : (
                  approvePreview.reason
                )}
              </p>
            )}
            {st.checkedOutAt && !payLocked && (
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

      {(turf || staging || marks.dayTurf || marks.pins.length > 0 || marksOpen) && (
        <section className="section">
          <h2 className="section-title">Turf</h2>
          {turf ? (
            <p className="text-muted-sm">Turf assigned by {s.engagement.job.org.name}.</p>
          ) : marks.dayTurf ? (
            <p className="text-muted-sm">{isWorker ? "Your" : "The worker's"} own turf for today (dashed).</p>
          ) : (
            <p className="text-muted-sm">No turf assigned by the campaign{marksOpen ? " — mark your own for today below." : "."}</p>
          )}
          {marksOpen ? (
            <TurfWorkbench shiftId={s.id} turf={turf} dayTurf={marks.dayTurf} staging={staging} pins={marks.pins} canDrawDayTurf={!turf} />
          ) : (
            <>
              <TurfMap turf={turf} dayTurf={marks.dayTurf} staging={staging} pins={toMapPins(marks.pins)} dayTurfLabel={isWorker ? "Your turf today" : "Worker's turf today"} />
              {marks.pins.length > 0 && <PinLegend />}
            </>
          )}
          {s.stagingLocation && <p className="text-muted-sm">Check in at {s.stagingLocation}.</p>}
        </section>
      )}

      {isOrg && logEvents.length > 0 && (
        <section className="section">
          <h2 className="section-title">Custody and activity log</h2>
          <ol className="list-card">
            {logEvents.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                <span>
                  <span className="font-semibold text-fg">{e.type === "NOTE" && ["pin", "unpin", "day_turf"].includes(String((e.payload as Record<string, unknown> | null)?.kind)) ? "Turf mark" : (EVENT_LABELS[e.type] ?? e.type)}</span>{" "}
                  <span className="text-muted">{eventDetail(e.type, e.payload)}</span>
                </span>
                <span className="text-xs text-subtle">
                  {e.actorId === null ? "" : e.actorId === s.engagement.worker.profileId ? "Worker · " : "Organization · "}
                  <LocalTime iso={e.createdAt.toISOString()} mode="time" />
                  {e.receivedAt && (
                    <>
                      {" "}· recorded offline, synced <LocalTime iso={e.receivedAt.toISOString()} mode="time" />
                    </>
                  )}
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
