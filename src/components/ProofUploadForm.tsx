"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/app/jobs/actions";
import { addProofAction } from "@/app/profile/credentials/proof-actions";
import { SIDE_LABELS, type ProofSide } from "@/lib/proof-sides";

const initial: ActionState = { ok: false, message: "" };

/**
 * Adds a photo of a Colorado circulator training certificate (C3.6b).
 * Sharing is off until the worker ticks it, for this photo alone.
 */
export function ProofUploadForm({ credentialId, sides }: { credentialId: string; sides: ProofSide[] }) {
  const [state, action, pending] = useActionState(addProofAction, initial);
  const form = useRef<HTMLFormElement>(null);
  // A photo that was added clears the form; a refused one stays to fix.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="credentialId" value={credentialId} />
      <label className="block space-y-1.5">
        <span className="label">Photo of your certificate</span>
        <input name="photo" type="file" accept="image/jpeg,image/png" required className="field" />
        <span className="text-hint block">A JPEG or PNG under 4 MB. Turfcut keeps a cleaned copy without location or camera details.</span>
      </label>
      {sides.length > 1 ? (
        <label className="block space-y-1.5">
          <span className="label">Side</span>
          <select name="side" className="field" defaultValue={sides[0]}>
            {sides.map((s) => <option key={s} value={s}>{SIDE_LABELS[s]}</option>)}
          </select>
        </label>
      ) : (
        <input type="hidden" name="side" value={sides[0]} />
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="shared" className="mt-0.5 size-4" />
        <span>
          Let organizations that hire me see this photo: only their owners and compliance members, only while I&apos;m hired and share my credentials with them.
          I see each time they look.
        </span>
      </label>
      <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Adding…" : `Add ${sides.length > 1 ? "photo" : `the ${SIDE_LABELS[sides[0]].toLowerCase()}`}`}</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
