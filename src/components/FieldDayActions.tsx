"use client";

import { useActionState, useRef, useState } from "react";
import { workerStep } from "@/app/shifts/actions";
import type { ActionState } from "@/app/jobs/actions";
import { ActionButton } from "@/components/ActionButton";

const initial: ActionState = { ok: false, message: "" };

/**
 * Check-in. Asks the phone for its position once, to compare with the
 * staging point on the server. If location is declined or unavailable the
 * worker still checks in, marked "location not checked". Nothing is tracked
 * after this.
 */
export function CheckInButton({ shiftId, hasStaging }: { shiftId: string; hasStaging: boolean }) {
  const [state, action, pending] = useActionState(workerStep, initial);
  const form = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);

  function start() {
    if (!hasStaging || !navigator.geolocation) return form.current?.requestSubmit();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setLocating(false);
        setTimeout(() => form.current?.requestSubmit(), 0);
      },
      () => {
        setLocating(false);
        form.current?.requestSubmit();
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }

  return (
    <form ref={form} action={action} className="space-y-2">
      <input type="hidden" name="shiftId" value={shiftId} />
      <input type="hidden" name="kind" value="check_in" />
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <button type="button" onClick={start} className="btn-primary w-full sm:w-auto" disabled={pending || locating}>
        {locating ? "Checking location…" : pending ? "Checking in…" : "Check in"}
      </button>
      {hasStaging && (
        <p className="text-hint">
          Your phone&apos;s location is compared with the staging point once. Only &ldquo;at staging: yes/no&rdquo; is kept — never where you were.
        </p>
      )}
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}

/** The worker's on-shift controls. */
export function OnShiftActions({
  shiftId,
  workType,
  paused,
  packetsOut,
}: {
  shiftId: string;
  workType: "PETITION" | "CANVASS";
  paused: boolean;
  packetsOut: string[];
}) {
  const base = { shiftId };
  if (paused) {
    return <ActionButton action={workerStep} fields={{ ...base, kind: "resume" }} label="End break" />;
  }
  return (
    <div className="space-y-5">
      {workType === "PETITION" ? (
        <ActionButton action={workerStep} fields={{ ...base, kind: "log", unit: "signatures" }} label="Add signatures">
          <label className="w-32 space-y-1.5">
            <span className="label">Signatures</span>
            <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required placeholder="5" />
          </label>
        </ActionButton>
      ) : (
        <>
          <ActionButton action={workerStep} fields={{ ...base, kind: "log", unit: "doors" }} label="Add doors">
            <label className="w-32 space-y-1.5">
              <span className="label">Doors knocked</span>
              <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
            </label>
          </ActionButton>
          <ActionButton action={workerStep} fields={{ ...base, kind: "log", unit: "contacts" }} label="Add contacts" variant="btn-secondary">
            <label className="w-32 space-y-1.5">
              <span className="label">Contacts</span>
              <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
            </label>
          </ActionButton>
        </>
      )}

      {packetsOut.map((p) => (
        <ActionButton key={p} action={workerStep} fields={{ ...base, kind: "return_packet", packetId: p }} label={`Return packet ${p}`} variant="btn-secondary">
          <label className="w-32 space-y-1.5">
            <span className="label">Sheets returned</span>
            <input name="sheetsReturned" inputMode="numeric" pattern="[0-9]*" className="field" required />
          </label>
          <label className="w-32 space-y-1.5">
            <span className="label">Signatures on it</span>
            <input name="signatures" inputMode="numeric" pattern="[0-9]*" className="field" required />
          </label>
        </ActionButton>
      ))}

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <ActionButton action={workerStep} fields={{ ...base, kind: "pause" }} label="Take a break" variant="btn-secondary" />
        <ActionButton action={workerStep} fields={{ ...base, kind: "check_out" }} label="Check out" disabled={packetsOut.length > 0} />
      </div>
      {packetsOut.length > 0 && <p className="text-hint">Return your packets before checking out.</p>}
    </div>
  );
}
