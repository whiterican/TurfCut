"use client";

import { useActionState, useState } from "react";
import { cutWalkbooksAction, type WalkbookFormState } from "@/app/jobs/[jobId]/walkbooks/actions";
import { DEFAULT_STOPS_PER_BOOK, MAX_STOPS_PER_BOOK } from "@/lib/walkbooks";
import { PendingButton } from "@/components/PendingButton";

const initial: WalkbookFormState = { ok: false, message: "", errors: {} };

/** Cut an imported file's addresses into numbered walkbooks on this job, in walking order. */
export function WalkbookCut({ jobId, imports }: { jobId: string; imports: Array<{ id: string; label: string; unassigned: number }> }) {
  const [state, action] = useActionState(cutWalkbooksAction, initial);
  const open = imports.filter((i) => i.unassigned > 0);
  const [importId, setImportId] = useState(open[0]?.id ?? "");
  const [per, setPer] = useState(String(DEFAULT_STOPS_PER_BOOK));
  // After a cut empties the chosen file, fall back to the next one with addresses left.
  const chosen = open.find((i) => i.id === importId) ?? open[0];
  const n = Number(per);
  const books = chosen && Number.isInteger(n) && n >= 1 && n <= MAX_STOPS_PER_BOOK ? Math.ceil(chosen.unassigned / n) : null;
  const result = state.message ? <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p> : null;
  // A cut that used up the last addresses still says what it did.
  if (!open.length)
    return (
      <div className="space-y-2">
        {result}
        <p className="text-muted-sm">Every imported address is already on one of this job&apos;s walkbooks. Import another file to cut more.</p>
      </div>
    );
  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="min-w-0 space-y-1.5">
          <span className="label">File</span>
          <select name="importId" className="field" required value={chosen?.id ?? ""} onChange={(e) => setImportId(e.target.value)}>
            {open.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label} · {i.unassigned.toLocaleString("en-US")} not yet on a walkbook
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 space-y-1.5">
          <span className="label">Stops per walkbook</span>
          <input name="stopsPerBook" type="number" inputMode="numeric" min={1} max={MAX_STOPS_PER_BOOK} step={1} className="field" required value={per} onChange={(e) => setPer(e.target.value)} />
          {state.errors.stopsPerBook && <p className="field-error">{state.errors.stopsPerBook}</p>}
        </label>
      </div>
      <p className="text-hint">
        Stops go in walking order: by ZIP and street, up the odd side and back down the even side.
        {books !== null && ` That makes ${books.toLocaleString("en-US")} ${books === 1 ? "walkbook" : "walkbooks"}.`}
      </p>
      <PendingButton pendingLabel="Cutting…" doneLabel="Cut" result={state.message ? state : null}>
        Cut walkbooks
      </PendingButton>
      {result}
    </form>
  );
}
