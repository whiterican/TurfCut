"use client";

import { useActionState, useRef, useState } from "react";
import { importAddressesAction, type WalkbookFormState } from "@/app/jobs/[jobId]/walkbooks/actions";
import { MAX_FILE_BYTES, MAX_ROWS, readAddressFile, type AddressFile } from "@/lib/walkbooks";
import { PendingButton } from "@/components/PendingButton";

const initial: WalkbookFormState = { ok: false, message: "", errors: {} };
const PREVIEW_ROWS = 5;
const PREVIEW_SKIPPED = 8;

/**
 * Bring an authorized file (W1). The preview is worked out here, in the
 * browser, from the same reader the server uses: nothing is sent until the
 * uploader has seen which columns will be dropped and confirmed the file's
 * source, purpose and license. The server reads the file again and keeps
 * addresses only.
 */
export function WalkbookImport({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(importAddressesAction, initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ ok: true; file: AddressFile } | { ok: false; reason: string } | null>(null);
  // Kept in state so a refused import doesn't clear them (React resets uncontrolled fields after an action).
  const [source, setSource] = useState("");
  const [purpose, setPurpose] = useState("");
  const [license, setLicense] = useState("");
  const [authorized, setAuthorized] = useState(false);
  // After an import lands, start over: the next file needs its own preview and its own statement.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) {
      setFile(null);
      setPreview(null);
      setSource("");
      setPurpose("");
      setLicense("");
      setAuthorized(false);
    }
  }
  const err = (k: string) => (state.errors[k] ? <p className="field-error">{state.errors[k]}</p> : null);

  // The newest choice wins: a big file still being read must not show its preview over a later, smaller one.
  const latest = useRef<File | null>(null);
  async function choose(f: File | null) {
    latest.current = f;
    setFile(f);
    setPreview(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setPreview({ ok: false, reason: "The file is over 2 MB. Split it, or keep only the address columns." });
    const read = readAddressFile(await f.text());
    if (latest.current === f) setPreview(read);
  }

  // The chosen file goes with the form even after a refused attempt has reset the input.
  const submit = (fd: FormData) => {
    if (file) fd.set("file", file);
    return action(fd);
  };
  const ready = preview?.ok === true;

  return (
    <form action={submit} className="card space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="block space-y-1.5">
        <span className="label">CSV file</span>
        <input type="file" name="file" accept=".csv,text/csv" className="field" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        <span className="text-hint block">One row per address, with a header row. Up to {MAX_ROWS.toLocaleString("en-US")} rows and 2 MB.</span>
        {err("file")}
      </label>

      {preview && !preview.ok && <p role="alert" className="text-danger-msg">{preview.reason}</p>}
      {preview?.ok && <Preview name={file?.name ?? ""} file={preview.file} />}

      {ready && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 space-y-1.5">
              <span className="label">Where the file came from</span>
              <input name="recordSource" className="field" maxLength={200} required placeholder="County voter file, October 2026" value={source} onChange={(e) => setSource(e.target.value)} />
              {err("recordSource")}
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="label">License or permission</span>
              <input name="license" className="field" maxLength={500} required placeholder="County public-records terms" value={license} onChange={(e) => setLicense(e.target.value)} />
              {err("license")}
            </label>
            <label className="min-w-0 space-y-1.5 sm:col-span-2">
              <span className="label">What the addresses are for</span>
              <textarea name="purpose" className="field" rows={2} maxLength={500} required placeholder="Door canvassing on this job" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              {err("purpose")}
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" name="authorized" className="mt-1" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            <span>Our organization is authorized to use this file for this purpose, under this license.</span>
          </label>
          {err("authorized")}
          <PendingButton pendingLabel="Importing…" doneLabel="Imported" result={state.message ? state : null}>
            Import {preview.file.rows.length.toLocaleString("en-US")} {preview.file.rows.length === 1 ? "address" : "addresses"}
          </PendingButton>
        </>
      )}
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}

function Preview({ name, file }: { name: string; file: AddressFile }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-inner)] border border-border p-3">
      <p className="text-sm text-fg">
        <span className="font-semibold">{name || "Your file"}:</span> {file.rows.length.toLocaleString("en-US")} of {file.rowCount.toLocaleString("en-US")}{" "}
        {file.rowCount === 1 ? "row has" : "rows have"} a usable address.
        {file.withPoint > 0 && ` ${file.withPoint.toLocaleString("en-US")} ${file.withPoint === 1 ? "has" : "have"} a map point from the file.`}
      </p>
      <div className="space-y-1">
        <p className="label">Kept: the address, and nothing else</p>
        <ul className="text-sm text-fg">
          {file.rows.slice(0, PREVIEW_ROWS).map((r) => (
            <li key={r.rowNumber} className="truncate">
              <span className="text-hint">Line {r.rowNumber} · </span>
              {r.line1}
              {r.unit ? `, ${r.unit}` : ""}, {r.city}, {r.state} {r.zip}
            </li>
          ))}
          {file.rows.length > PREVIEW_ROWS && <li className="text-hint">…and {(file.rows.length - PREVIEW_ROWS).toLocaleString("en-US")} more</li>}
        </ul>
      </div>
      {file.dropped.length > 0 && (
        <div className="space-y-1">
          <p className="label">Dropped before anything is sent: {file.dropped.length} {file.dropped.length === 1 ? "column" : "columns"}</p>
          <p className="text-sm text-fg break-words">{file.dropped.join(", ")}</p>
          <p className="text-hint">Names, party, vote history, phone numbers and every other column stay out of Turfcut. Only the column names are recorded, so you can see what was left out.</p>
        </div>
      )}
      {file.unitsLeftOff > 0 && (
        <p className="text-hint">
          {file.unitsLeftOff.toLocaleString("en-US")} second address {file.unitsLeftOff === 1 ? "line wasn't" : "lines weren't"} shaped like a unit (for example &ldquo;C/O&nbsp;…&rdquo;) and will be left off.
        </p>
      )}
      {file.skipped.length > 0 && (
        <div className="space-y-1">
          <p className="label">Skipped: {file.skipped.length.toLocaleString("en-US")} {file.skipped.length === 1 ? "row" : "rows"}</p>
          <ul className="text-sm text-fg">
            {file.skipped.slice(0, PREVIEW_SKIPPED).map((s) => (
              <li key={s.rowNumber}>
                Line {s.rowNumber}: {s.reason}
              </li>
            ))}
            {file.skipped.length > PREVIEW_SKIPPED && <li className="text-hint">…and {(file.skipped.length - PREVIEW_SKIPPED).toLocaleString("en-US")} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
