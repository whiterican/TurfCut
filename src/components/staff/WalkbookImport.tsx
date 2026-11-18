"use client";

import { useActionState, useRef, useState } from "react";
import { importAddressesAction, type WalkbookFormState } from "@/app/jobs/[jobId]/walkbooks/actions";
import { MAX_FILE_BYTES, MAX_ROWS, NEEDS_STATE_ACK, readAddressFile, RETENTION_DAYS, SOURCE_SYSTEMS, type AddressFile } from "@/lib/walkbooks";
import { PendingButton } from "@/components/PendingButton";

const initial: WalkbookFormState = { ok: false, message: "", errors: {} };
const PREVIEW_ROWS = 5;
const PREVIEW_SKIPPED = 8;

/**
 * Bring an authorized file (W1). The preview is worked out here, in the
 * browser, from the same reader the server uses: nothing is sent until the
 * uploader has seen exactly what will be stored (each row's address, its
 * record ID and every other column), what never is, and when it will be
 * deleted, and has confirmed the file's source, purpose and license. The
 * server reads the file again and stores what the preview showed.
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
  const [sourceSystem, setSourceSystem] = useState("");
  const [ackAZ, setAckAZ] = useState(false);
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
      setSourceSystem("");
      setAckAZ(false);
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
    if (f.size > MAX_FILE_BYTES) return setPreview({ ok: false, reason: "The file is over 2 MB. Split it into smaller files." });
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
            <label className="min-w-0 space-y-1.5">
              <span className="label">Which system it came from {" "}<span className="text-hint">(optional)</span></span>
              <select name="sourceSystem" className="field" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}>
                <option value="">Not sure / not listed</option>
                {SOURCE_SYSTEMS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              {err("sourceSystem")}
            </label>
            <label className="min-w-0 space-y-1.5 sm:col-span-2">
              <span className="label">What the addresses are for</span>
              <textarea name="purpose" className="field" rows={2} maxLength={500} required placeholder="Door canvassing on this job" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              {err("purpose")}
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" name="authorized" className="mt-1 size-4" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            <span>Our organization is authorized to use this file for this purpose, under this license.</span>
          </label>
          {err("authorized")}
          {preview.file.states.some((s) => (NEEDS_STATE_ACK as readonly string[]).includes(s)) && (
            <>
              <label className="flex items-start gap-2 text-sm text-fg">
                <input type="checkbox" name="ackAZ" className="mt-1 size-4" checked={ackAZ} onChange={(e) => setAckAZ(e.target.checked)} />
                <span>
                  This file has Arizona addresses. Arizona law (A.R.S. § 16-168) limits voter-list data to political and election use and bars posting it on the internet. We have confirmed we may upload this file here.
                </span>
              </label>
              {err("ackAZ")}
            </>
          )}
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
        <p className="label">Stored: each row&apos;s address</p>
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
      <div className="space-y-1">
        <p className="label">Stored with each row, for matching your return file</p>
        <p className="text-sm text-fg break-words">
          {file.recordIdColumn ? (
            <>
              Record ID: <span className="font-semibold">{file.recordIdColumn}</span>.{" "}
            </>
          ) : (
            "No record ID column found (a column such as VANID or Contact ID). "
          )}
          {file.storedColumns.length > 0 ? (
            <>
              Every other column, {file.storedColumns.length} in all: {file.storedColumns.join(", ")}.
            </>
          ) : (
            "No other columns."
          )}
        </p>
        <p className="text-hint">
          These can hold names, phone numbers, party and vote history. They stay with the row, are never shown to workers or used to match or rank anyone, and are deleted with the address.
        </p>
      </div>
      {file.dropped.length > 0 && (
        <div className="space-y-1">
          <p className="label">Never stored: {file.dropped.length} {file.dropped.length === 1 ? "column" : "columns"}</p>
          <p className="text-sm text-fg break-words">{file.dropped.join(", ")}</p>
          <p className="text-hint">Government ID numbers, birth dates, and payment and password columns are left out whatever the file says; so are any columns past the first 60, or cut to fit a row.</p>
        </div>
      )}
      <p className="text-sm text-fg">
        <span className="font-semibold">Deleted in {RETENTION_DAYS} days:</span> the addresses, record IDs and every other column. You can delete them sooner, and they go when every job this file is cut for has closed. The walkbooks, stops and outcomes stay, without the addresses.
      </p>
      {file.unitsLeftOff > 0 && (
        <p className="text-hint">
          {file.unitsLeftOff.toLocaleString("en-US")} second address {file.unitsLeftOff === 1 ? "line isn't" : "lines aren't"} shaped like a unit (for example &ldquo;C/O&nbsp;…&rdquo;): {file.unitsLeftOff === 1 ? "it is" : "they are"} kept as data, not as part of the address.
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
