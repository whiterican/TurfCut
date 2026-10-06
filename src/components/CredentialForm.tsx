"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { removeCredentialAction, saveCredentialAction, type CredentialFormState } from "@/app/profile/credentials/actions";
import { CREDENTIAL_KINDS, type CredentialKind } from "@/lib/credentials";

const initial: CredentialFormState = { ok: false, message: "", errors: {} };
type Values = { kind: CredentialKind; label: string; state: string; identifier: string; issuedOn: string; expiresOn: string };
const EMPTY: Values = { kind: "CIRCULATOR_REGISTRATION", label: "", state: "", identifier: "", issuedOn: "", expiresOn: "" };

function useSubmitState(run: (fd: FormData) => Promise<CredentialFormState>, after?: (r: CredentialFormState) => void) {
  const [state, setState] = useState<CredentialFormState>(initial);
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const fd = new FormData(ev.currentTarget);
    start(async () => {
      try {
        const r = await run(fd);
        setState(r);
        after?.(r);
      } catch (err) {
        unstable_rethrow(err);
        setState({ ok: false, message: "Couldn't reach Turfcut, so this may not have saved. Try again.", errors: {} });
      } finally {
        inFlight.current = false;
      }
    });
  };
  return { state, pending, onSubmit };
}

/**
 * Add a credential, or edit one (`id` + `initial`). Controlled and sent from
 * onSubmit, so a refused save keeps what was typed. Editing can't change the
 * kind; everything entered is self-reported.
 */
export function CredentialForm({ id, values: start, onDone }: { id?: string; values?: Values; onDone?: () => void }) {
  const [v, setV] = useState<Values>(start ?? EMPTY);
  const { state, pending, onSubmit } = useSubmitState(saveCredentialAction, (r) => {
    if (r.ok && !id) setV(EMPTY);
    if (r.ok) onDone?.();
  });
  const e = state.ok ? {} : state.errors;
  const kind = CREDENTIAL_KINDS.find((k) => k.value === v.kind)!;
  const f = (k: keyof Values) => ({
    name: k,
    value: v[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: ev.target.value })),
    "aria-invalid": e[k] ? true : undefined,
    "aria-describedby": e[k] ? `${id ?? "new"}-err-${k}` : undefined,
  });
  const err = (k: string) => e[k] && <p id={`${id ?? "new"}-err-${k}`} className="text-danger-msg">{e[k]}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <label className="block space-y-1.5">
        <span className="label">Kind</span>
        {id ? (
          <>
            <input type="hidden" name="kind" value={v.kind} />
            <span className="block text-sm text-fg">{kind.label}</span>
          </>
        ) : (
          <select className="field" {...f("kind")}>
            {CREDENTIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        )}
        <span className="text-hint block">{kind.hint}</span>
        {err("kind")}
      </label>
      {kind.needsLabel && (
        <label className="block space-y-1.5">
          <span className="label">{v.kind === "TRAINING" ? "Course" : "What it is"}</span>
          <input className="field" maxLength={80} autoComplete="off" {...f("label")} />
          {err("label")}
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">State {v.kind === "CIRCULATOR_REGISTRATION" ? "" : "(if any)"}</span>
          <input className="field uppercase" maxLength={2} autoComplete="off" placeholder="CO" {...f("state")} />
          {err("state")}
        </label>
        <label className="block space-y-1.5">
          <span className="label">Number (optional)</span>
          <input className="field" maxLength={64} autoComplete="off" {...f("identifier")} />
          <span className="text-hint block">Only ever shown masked, like •••• 2345. Organizations never see it.</span>
          {err("identifier")}
        </label>
        <label className="block space-y-1.5">
          <span className="label">Issued (optional)</span>
          <input type="date" className="field" {...f("issuedOn")} />
          {err("issuedOn")}
        </label>
        <label className="block space-y-1.5">
          <span className="label">Expires (optional)</span>
          <input type="date" className="field" {...f("expiresOn")} />
          {err("expiresOn")}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save changes" : "Add credential"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}

export function RemoveCredential({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const { state, pending, onSubmit } = useSubmitState(removeCredentialAction);
  if (!confirming) {
    return <button type="button" className="link text-sm" onClick={() => setConfirming(true)}>Remove</button>;
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm text-fg">Remove {name}?</span>
      <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Removing…" : "Remove"}</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
