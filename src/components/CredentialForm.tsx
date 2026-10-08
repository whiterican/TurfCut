"use client";

import { createContext, useContext, useId, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
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

type Wallet = {
  message: string;
  /** The status line's id, so announce can focus it. */
  lineId: string;
  /** Shows `message` on the status line ("" clears it). `from`: the part of the page it came from. */
  announce: (message: string, from?: Element | null) => void;
};
const WalletContext = createContext<Wallet | null>(null);
const useAnnounce = () => useContext(WalletContext)?.announce ?? (() => {});

/**
 * The wallet's own status line (drawn by <WalletStatusLine>, around both
 * the list and the add form): a removal's confirmation lands here, since
 * the removed credential's row (and its form) is gone once the list
 * refreshes. Any other save in the wallet clears it; an empty line takes no
 * space.
 */
export function WalletStatus({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const lineId = useId();
  const announce = (m: string, from?: Element | null) => {
    // Cleared at once, so the same words twice (two "Removed CO registration") are announced twice.
    flushSync(() => setMessage(""));
    if (!m) return;
    requestAnimationFrame(() => {
      setMessage(m);
      requestAnimationFrame(() => {
        // Focus follows only if it was lost with the removed row (or is still in it),
        // never away from a field the worker has moved on to.
        const a = document.activeElement;
        if (!a || a === document.body || from?.contains(a)) document.getElementById(lineId)?.focus();
      });
    });
  };
  return <WalletContext value={{ message, lineId, announce }}>{children}</WalletContext>;
}

export function WalletStatusLine() {
  const w = useContext(WalletContext);
  if (!w) return null;
  return <p id={w.lineId} tabIndex={-1} role="status" className={w.message ? "text-success-msg outline-none" : "sr-only"}>{w.message}</p>;
}

/**
 * Add a credential, or edit one (`id` + `values`). Controlled and sent from
 * onSubmit, so a refused save keeps what was typed. Editing can't change the
 * kind; everything entered is self-reported. A blank number keeps the saved
 * one (shown masked); a box takes it away.
 */
export function CredentialForm({ id, values: start, masked, onDone }: { id?: string; values?: Values; masked?: string | null; onDone?: () => void }) {
  const [v, setV] = useState<Values>(start ?? EMPTY);
  const [clearNumber, setClearNumber] = useState(false);
  const announce = useAnnounce();
  const { state, pending, onSubmit: submit } = useSubmitState(saveCredentialAction, (r) => {
    if (r.ok && !id) setV(EMPTY);
    // The saved number is shown masked from now on; don't keep the typed one on screen.
    if (r.ok && id) {
      setV((x) => ({ ...x, identifier: "" }));
      setClearNumber(false);
    }
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
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    submit(ev); // first: it stops the browser's own submit
    announce(""); // a new save: the wallet's last removal message no longer applies
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      {id ? (
        <div className="space-y-1">
          <input type="hidden" name="kind" value={v.kind} />
          <p className="label">Kind</p>
          <p className="text-sm text-fg">{kind.label}</p>
          <p className="text-hint">{kind.hint}</p>
        </div>
      ) : (
        <label className="block space-y-1.5">
          <span className="label">Kind</span>
          <select className="field" {...f("kind")}>
            {CREDENTIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <span className="text-hint block">{kind.hint}</span>
          {err("kind")}
        </label>
      )}
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
          <input className="field uppercase" maxLength={2} autoComplete="off" autoCapitalize="characters" placeholder="CO" {...f("state")} />
          {err("state")}
        </label>
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="label">Number (optional)</span>
            <input className="field" maxLength={64} autoComplete="off" disabled={clearNumber} {...f("identifier")} />
            <span className="text-hint block">
              {masked && !clearNumber ? `Leave blank to keep ${masked}. ` : ""}Turfcut keeps only the last 4 characters, shown like •••• 2345. Organizations never see it.
            </span>
          </label>
          {masked && (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name="clearIdentifier"
                checked={clearNumber}
                onChange={(ev) => {
                  setClearNumber(ev.target.checked);
                  // The field is ignored while ticked: don't leave a number on screen that won't be saved.
                  if (ev.target.checked) setV((x) => ({ ...x, identifier: "" }));
                }}
              />
              Take the number {masked} off
            </label>
          )}
          {err("identifier")}
        </div>
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
  const form = useRef<HTMLFormElement>(null);
  const announce = useAnnounce();
  const { state, pending, onSubmit } = useSubmitState(removeCredentialAction, (r) => {
    // The whole row goes, so focus anywhere in it (its Edit too) would be lost.
    if (r.ok) announce(`Removed ${name}. It stays on record, but nobody sees it.`, form.current?.closest("li") ?? form.current);
  });
  if (!confirming) {
    return <button type="button" className="link text-sm" onClick={() => setConfirming(true)}>Remove {name}</button>;
  }
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm text-fg">Remove {name}?</span>
      {/* Focus moves here when the confirm opens, so it isn't lost with the button that opened it. */}
      <button className="btn-secondary btn-sm" disabled={pending} autoFocus>{pending ? "Removing…" : "Remove"}</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
      {state.message && !state.ok && <p role="status" className="text-danger-msg">{state.message}</p>}
    </form>
  );
}
