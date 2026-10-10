"use client";

import { useActionState, useRef, useState } from "react";
import type { ActionState } from "@/app/jobs/actions";
import { addProofAction } from "@/app/profile/credentials/proof-actions";
import { PROOF_MAX_BYTES, SIDE_LABELS, type ProofSide } from "@/lib/proof-sides";

const initial: ActionState = { ok: false, message: "" };
const MB = 1024 * 1024;
/** Above this, the browser shrinks the photo first (phone photos are often 5–12 MB; the server keeps at most 2400 px anyway). */
const SHRINK_OVER = 1.5 * MB;
const SHRINK_EDGE = 2400;

/**
 * Shrinks a photo in the browser: upright, at most SHRINK_EDGE on its
 * longest side, as a JPEG. Null when the browser can't (the original is
 * sent, within the limit).
 */
async function shrink(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SHRINK_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

/**
 * Adds a photo of a Colorado circulator training certificate (C3.6b).
 * Sharing is off until the worker ticks it, for this photo alone.
 */
export function ProofUploadForm({ credentialId, sides }: { credentialId: string; sides: ProofSide[] }) {
  const [state, action, pending] = useActionState(addProofAction, initial);
  const form = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState("");
  // Choosing again while a photo is still shrinking: only the latest choice lands.
  const pick = useRef(0);

  const choose = async (chosen: File | null) => {
    setProblem("");
    setFile(null);
    if (!chosen) return;
    if (!["image/jpeg", "image/png"].includes(chosen.type)) {
      setProblem("Send a JPEG or PNG photo.");
      return;
    }
    const mine = ++pick.current;
    let ready = chosen;
    if (chosen.size > SHRINK_OVER) {
      setPreparing(true);
      ready = (await shrink(chosen)) ?? chosen;
      if (mine !== pick.current) return;
      setPreparing(false);
    }
    if (ready.size > PROOF_MAX_BYTES) {
      setProblem("That photo is over 4 MB even after shrinking. Take it again at a lower resolution.");
      return;
    }
    setFile(ready);
  };

  // The server receives the (possibly shrunk) file, not the one the input
  // holds. The form clears as it's sent: the answer says whether the photo
  // was added or has to be chosen again.
  const submit = (fd: FormData) => {
    if (!file) return;
    fd.set("photo", file, file.name);
    form.current?.reset();
    setFile(null);
    action(fd);
  };

  return (
    <form ref={form} action={submit} className="space-y-3">
      <input type="hidden" name="credentialId" value={credentialId} />
      <label className="block space-y-1.5">
        <span className="label">Photo of your certificate</span>
        <input name="photo" type="file" accept="image/jpeg,image/png" required className="field" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
        <span className="text-hint block">A JPEG or PNG. A large photo is shrunk on your phone first; Turfcut keeps a cleaned copy without location or camera details.</span>
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
          They see everything printed on the certificate, including my name and the training date. I see each time they look.
        </span>
      </label>
      <button className="btn-secondary btn-sm" disabled={pending || preparing || !file || !!problem}>
        {pending ? "Adding…" : preparing ? "Preparing…" : `Add ${sides.length > 1 ? "photo" : `the ${SIDE_LABELS[sides[0]].toLowerCase()}`}`}
      </button>
      {(problem || state.message) && (
        <p role="status" className={!problem && state.ok ? "text-success-msg" : "text-danger-msg"}>{problem || state.message}</p>
      )}
    </form>
  );
}
