"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/jobs/actions";
import { LocalDateTimeInput } from "@/components/LocalDateTimeInput";

const initial: ActionState = { ok: false, message: "" };
type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

function Status({ state }: { state: ActionState }) {
  return state.message ? <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p> : null;
}

const Reason = () => (
  <label className="block space-y-1.5">
    <span className="label">Why (the worker sees it)</span>
    <input name="reason" className="field" required minLength={10} maxLength={500} placeholder="e.g. Forgot to check out; confirmed with the worker" />
  </label>
);

/** Correct one of the worker's entries: its time, or a value. Folded until opened. */
export function CorrectEntry({ action, shiftId, eventId, type, atIso, values }: { action: Action; shiftId: string; eventId: string; type: string; atIso: string; values: Record<string, number> }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <details className="group text-sm">
      <summary className="link cursor-pointer list-none text-xs font-semibold">
        <span className="group-open:hidden">Correct</span>
        <span className="hidden group-open:inline">Cancel</span>
      </summary>
      <form action={formAction} className="space-y-3 pt-2">
        <input type="hidden" name="shiftId" value={shiftId} />
        <input type="hidden" name="kind" value="correct_event" />
        <input type="hidden" name="eventId" value={eventId} />
        <LocalDateTimeInput name="at" label="When it happened" defaultIso={atIso} />
        {Object.entries(values).map(([k, v]) => (
          <label key={k} className="block space-y-1.5">
            <span className="label">{LABELS[k] ?? k}</span>
            <input name={k} inputMode="numeric" pattern="[0-9]*" className="field w-32" defaultValue={v} />
          </label>
        ))}
        <Reason />
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : `Correct this ${TYPE_WORD[type] ?? "entry"}`}</button>
        <Status state={state} />
      </form>
    </details>
  );
}

const LABELS: Record<string, string> = { count: "Count", sheetsReturned: "Sheets returned", signatures: "Signatures claimed" };
const TYPE_WORD: Record<string, string> = {
  CHECK_IN: "check-in",
  CHECK_OUT: "check-out",
  PAUSE_START: "break start",
  PAUSE_END: "break end",
  SIGNATURE_SUBMITTED: "count",
  DOOR_KNOCK: "count",
  CONTACT: "count",
  PACKET_RETURN: "packet return",
};

/** Enter an entry the worker's phone never recorded (a missed check-out, work older than a day). */
export function EnterEntry({ action, shiftId, petition, packetsOut }: { action: Action; shiftId: string; petition: boolean; packetsOut: string[] }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const types: Array<[string, string]> = [
    ["CHECK_IN", "Check-in"],
    ["PAUSE_START", "Break started"],
    ["PAUSE_END", "Break ended"],
    ...(petition ? [["SIGNATURE_SUBMITTED", "Signatures logged"] as [string, string]] : [["DOOR_KNOCK", "Doors logged"] as [string, string], ["CONTACT", "Contacts logged"] as [string, string]]),
    ...(packetsOut.length ? [["PACKET_RETURN", "Packet returned"] as [string, string]] : []),
    ["CHECK_OUT", "Check-out"],
  ];
  return (
    <details className="group">
      <summary className="link cursor-pointer list-none text-sm font-semibold">
        <span className="group-open:hidden">Enter a missing entry</span>
        <span className="hidden group-open:inline">Cancel</span>
      </summary>
      <form action={formAction} className="space-y-3 pt-3">
        <input type="hidden" name="shiftId" value={shiftId} />
        <input type="hidden" name="kind" value="enter_event" />
        <label className="block space-y-1.5">
          <span className="label">What</span>
          <select name="type" className="field" required defaultValue="">
            <option value="" disabled>Pick one</option>
            {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <LocalDateTimeInput name="at" label="When it happened" required />
        <label className="block space-y-1.5">
          <span className="label">Count (for logged work)</span>
          <input name="count" inputMode="numeric" pattern="[0-9]*" className="field w-32" />
        </label>
        {packetsOut.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="label">Packet</span>
              <select name="packetId" className="field" defaultValue="">
                <option value="">—</option>
                {packetsOut.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="label">Sheets returned</span>
              <input name="sheetsReturned" inputMode="numeric" pattern="[0-9]*" className="field" />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Signatures claimed</span>
              <input name="signatures" inputMode="numeric" pattern="[0-9]*" className="field" />
            </label>
          </div>
        )}
        <Reason />
        <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : "Enter it in the worker's name"}</button>
        <p className="text-hint">Entered in the worker&apos;s name, signed by you, at the time you give. It counts toward pay like any other entry; if pay was already recorded, the shift needs approving again.</p>
        <Status state={state} />
      </form>
    </details>
  );
}
