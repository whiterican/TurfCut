"use client";

import { useActionState, useState } from "react";
import { consentToPreferences, type ConsentState } from "@/app/profile/preferences/actions";
import {
  boundaryText,
  CAMPAIGN_TYPES,
  employerFitView,
  FIT_FIELDS,
  FLOW_STEPS,
  FREE_TEXT_KINDS,
  IDENTITY_LABELS,
  identityText,
  IMPORTANCE,
  ISSUES,
  issueText,
  PARTIES,
  partyText,
  POSITIONS,
  RELATIONSHIPS,
  SHARING_MODES,
  STANCES,
  VISIBILITY_OPTIONS,
  EXPIRY_OPTIONS,
  type ExpiryChoice,
  type Boundary,
  type BoundaryKind,
  type FitPreferences,
  type IssueAnswer,
  type IssueKey,
  type PartyAnswer,
  type Stance,
  type VisibilityMode,
} from "@/lib/political-fit";

type Draft = Omit<FitPreferences, "visibilityMode"> & { visibilityMode: VisibilityMode | null };

const STEP_TITLES: Record<(typeof FLOW_STEPS)[number], string> = {
  visibility: "Who can see your answers",
  identity: "Identity labels",
  party: "Party relationship",
  issues: "Issue positions",
  boundaries: "Campaign boundaries",
  review: "Review and consent",
};

const box = "card";
const select = "field sm:w-auto sm:min-w-44";
const input = "field";
const chip = "chip";

const nullIfEmpty = <T,>(xs: T[]) => (xs.length ? xs : null);

export function PreferencesFlow({ initial, consentText }: { initial: FitPreferences | null; consentText: string }) {
  const [step, setStepRaw] = useState(0);
  // Steps you've reached stay tappable, so you can jump back (or forward
  // again) without paging through.
  // Returning workers (saved answers) can jump anywhere straight away.
  const [reached, setReached] = useState(initial ? FLOW_STEPS.length - 1 : 0);
  const setStep = (n: number | ((s: number) => number)) => {
    const next = typeof n === "function" ? n(step) : n;
    setStepRaw(next);
    setReached((r) => Math.max(r, next));
  };
  // Starts from the worker's own latest answers, or from nothing. There are
  // no pre-selected answers: the worker picks every value themselves.
  const [draft, setDraft] = useState<Draft>(
    initial ?? { visibilityMode: null, identityLabels: null, partyRelationship: null, issuePositions: null, campaignBoundaries: null }
  );
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(consentToPreferences, { ok: false, message: "" });

  const key = FLOW_STEPS[step];
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const skip = (patch: Partial<Draft>) => {
    set(patch);
    setStep((s) => s + 1);
  };

  return (
    <div className="space-y-8">
      <nav aria-label="Steps" className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-fg">Step {step + 1} of {FLOW_STEPS.length}</span>
          <span className="text-subtle">{Math.round(((step + 1) / FLOW_STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((step + 1) / FLOW_STEPS.length) * 100}%` }} />
        </div>
        <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FLOW_STEPS.map((s, i) => (
            <li key={s} className="shrink-0">
              <button
                type="button"
                className={`step min-h-10 disabled:cursor-not-allowed disabled:opacity-50 ${i === step ? "step-current" : i <= reached ? "step-done" : ""}`}
                aria-current={i === step ? "step" : undefined}
                disabled={i > reached || (i > 0 && !draft.visibilityMode)}
                onClick={() => setStep(i)}
              >
                {i < step && <span aria-hidden>✓</span>}
                {STEP_TITLES[s]}
              </button>
            </li>
          ))}
        </ol>
        {!draft.visibilityMode && <p className="text-hint">Choose who can see your answers first — the other steps open after that.</p>}
      </nav>

      <h2 className="section-title text-xl">{STEP_TITLES[key]}</h2>

      {key === "visibility" && (
        <fieldset className="space-y-2">
          <legend className="sr-only">Visibility</legend>
          {VISIBILITY_OPTIONS.map((o) => (
            <label key={o.value} className="option-card">
              <input type="radio" name="visibility" checked={draft.visibilityMode === o.value} onChange={() => set({ visibilityMode: o.value })} />
              <span>
                <span className="font-medium text-fg">{o.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{o.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {key === "identity" && <IdentityStep draft={draft} set={set} />}
      {key === "party" && <PartyStep value={draft.partyRelationship} onChange={(p) => set({ partyRelationship: p })} />}
      {key === "issues" && <IssuesStep value={draft.issuePositions} onChange={(v) => set({ issuePositions: v })} />}
      {key === "boundaries" && <BoundariesStep value={draft.campaignBoundaries ?? []} onChange={(b) => set({ campaignBoundaries: nullIfEmpty(b) })} />}

      {key === "review" && draft.visibilityMode && (
        <Review draft={draft as FitPreferences} setDraft={(d) => setDraft(d)} consentText={consentText} formAction={formAction} pending={pending} state={state} />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        {step > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {key !== "review" && (
          <button
            type="button"
            disabled={key === "visibility" && !draft.visibilityMode}
            className="btn-primary"
            onClick={() => setStep(step + 1)}
          >
            Next
          </button>
        )}
        {key === "identity" && <button type="button" className="btn-ghost" onClick={() => skip({ identityLabels: null })}>Prefer not to answer</button>}
        {key === "party" && <button type="button" className="btn-ghost" onClick={() => skip({ partyRelationship: null })}>Prefer not to answer</button>}
        {key === "issues" && <button type="button" className="btn-ghost" onClick={() => skip({ issuePositions: null })}>Prefer not to answer</button>}
        {key === "boundaries" && <button type="button" className="btn-ghost" onClick={() => skip({ campaignBoundaries: null })}>No boundaries</button>}
      </div>
    </div>
  );
}

function IdentityStep({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const labels = draft.identityLabels ?? [];
  const other = labels.find((l) => l.label === "other");
  const toggle = (label: (typeof IDENTITY_LABELS)[number]) => {
    const has = labels.some((l) => l.label === label);
    const next = has ? labels.filter((l) => l.label !== label) : [...labels, label === "other" ? { label, text: "" } : { label }];
    set({ identityLabels: nullIfEmpty(next) });
  };
  return (
    <div className="space-y-3">
      <p className="text-muted-sm">Pick any that describe you, or none.</p>
      <div className="flex flex-wrap gap-2">
        {IDENTITY_LABELS.map((l) => (
          <label key={l} className={chip}>
            <input type="checkbox" checked={labels.some((x) => x.label === l)} onChange={() => toggle(l)} />
            {l}
          </label>
        ))}
      </div>
      {other && (
        <label className="block space-y-1.5">
          <span className="label">In your own words</span>
          <input
            className={`${input} w-full`}
            maxLength={60}
            value={other.text ?? ""}
            onChange={(e) => set({ identityLabels: labels.map((l) => (l.label === "other" ? { ...l, text: e.target.value } : l)) })}
          />
        </label>
      )}
    </div>
  );
}

function PartyStep({ value, onChange }: { value: PartyAnswer | null; onChange: (p: PartyAnswer | null) => void }) {
  const rel = RELATIONSHIPS.find((r) => r.value === value?.relationship);
  const needsText = value?.relationship === "other" || value?.party === "other";
  return (
    <div className="space-y-3">
      <p className="text-muted-sm">
        How you relate to political parties, in your own terms. This is not your voter registration, and Turfcut never looks that up.
      </p>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        {RELATIONSHIPS.map((r) => (
          <label key={r.value} className="option-card items-center py-3 text-sm text-fg">
            <input
              type="radio"
              name="relationship"
              checked={value?.relationship === r.value}
              onChange={() => onChange({ relationship: r.value, shared: value?.shared })}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      {rel?.needsParty && (
        <label className="block space-y-1.5">
          <span className="label">Party</span>
          <select
            className={select}
            value={value?.party ?? ""}
            onChange={(e) => onChange({ ...value!, party: (e.target.value || undefined) as PartyAnswer["party"], text: undefined })}
          >
            <option value="">Choose…</option>
            {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {needsText && (
        <label className="block space-y-1.5">
          <span className="label">In your own words</span>
          <input className={`${input} w-full`} maxLength={60} value={value?.text ?? ""} onChange={(e) => onChange({ ...value!, text: e.target.value })} />
        </label>
      )}
    </div>
  );
}

function IssuesStep({
  value,
  onChange,
}: {
  value: FitPreferences["issuePositions"];
  onChange: (v: FitPreferences["issuePositions"]) => void;
}) {
  const update = (k: IssueKey, a: IssueAnswer | null) => {
    const next = { ...(value ?? {}) };
    if (a) next[k] = a;
    else delete next[k];
    onChange(Object.keys(next).length ? next : null);
  };
  return (
    <div className="space-y-2">
      <p className="text-muted-sm">Answer only the issues you choose. Leave the rest blank.</p>
      <ul className="list-card">
        {ISSUES.map((i) => {
          const a = value?.[i.key];
          return (
            <li key={i.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-fg">{i.label}</span>
              <span className="flex flex-col gap-2 sm:flex-row">
                <select
                  className={select}
                  value={a?.position ?? ""}
                  onChange={(e) =>
                    update(
                      i.key,
                      e.target.value
                        ? { ...a, position: e.target.value as IssueAnswer["position"], ...(e.target.value === "private" ? { shared: undefined } : {}) }
                        : null
                    )
                  }
                >
                  <option value="">Not answered</option>
                  {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {a && (
                  <select
                    className={select}
                    value={a.importance ?? ""}
                    onChange={(e) => update(i.key, { ...a, importance: (e.target.value || undefined) as IssueAnswer["importance"] })}
                    aria-label={`${i.label} importance`}
                  >
                    <option value="">Importance (optional)</option>
                    {IMPORTANCE.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StanceSelect({ label, value, onChange }: { label: string; value: Stance | ""; onChange: (s: Stance | "") => void }) {
  return (
    <li className="flex flex-col gap-2 p-3 text-sm text-fg sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      <select className={select} value={value} onChange={(e) => onChange(e.target.value as Stance | "")}>
        <option value="">No preference</option>
        {STANCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </li>
  );
}

function BoundariesStep({ value, onChange }: { value: Boundary[]; onChange: (b: Boundary[]) => void }) {
  const [freeKind, setFreeKind] = useState<(typeof FREE_TEXT_KINDS)[number]>("organization");
  const [freeTarget, setFreeTarget] = useState("");
  const stanceOf = (kind: BoundaryKind, target: string): Stance | "" => value.find((b) => b.kind === kind && b.target === target)?.stance ?? "";
  const setStance = (kind: BoundaryKind, target: string, stance: Stance | "") => {
    const rest = value.filter((b) => !(b.kind === kind && b.target === target));
    const prev = value.find((b) => b.kind === kind && b.target === target);
    onChange(stance ? [...rest, { kind, target, stance, shared: prev?.shared }] : rest);
  };
  const stanceProps = (kind: BoundaryKind, target: string) => ({
    value: stanceOf(kind, target),
    onChange: (st: Stance | "") => setStance(kind, target, st),
  });
  const named = value.filter((b) => (FREE_TEXT_KINDS as readonly string[]).includes(b.kind));

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h3 className="font-medium text-fg">Types of campaign</h3>
        <ul className="list-card">
          {CAMPAIGN_TYPES.map((c) => <StanceSelect key={c.value} label={c.label} {...stanceProps("campaign_type", c.value)} />)}
        </ul>
      </section>
      <section className="space-y-1">
        <h3 className="font-medium text-fg">Campaigns run by a party</h3>
        <ul className="list-card">
          {PARTIES.filter((p) => p !== "other").map((p) => <StanceSelect key={p} label={`${p} party`} {...stanceProps("party", p)} />)}
        </ul>
      </section>
      <section className="space-y-1">
        <h3 className="font-medium text-fg">Issue categories</h3>
        <ul className="list-card">
          {ISSUES.map((i) => <StanceSelect key={i.key} label={i.label} {...stanceProps("issue", i.key)} />)}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-fg">Specific organizations, candidates or measures</h3>
        {named.length > 0 && (
          <ul className="list-card">
            {named.map((b) => (
              <li key={`${b.kind}:${b.target}`} className="flex flex-col gap-2 p-3 text-sm text-fg sm:flex-row sm:items-center sm:justify-between">
                <span>{b.kind}: {b.target}</span>
                <span className="flex flex-col gap-2 sm:flex-row">
                  <select className={select} value={b.stance} onChange={(e) => setStance(b.kind, b.target, e.target.value as Stance)}>
                    {STANCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setStance(b.kind, b.target, "")}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={select} value={freeKind} onChange={(e) => setFreeKind(e.target.value as typeof freeKind)}>
            {FREE_TEXT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input className={`${input} sm:flex-1`} maxLength={100} placeholder="Name" value={freeTarget} onChange={(e) => setFreeTarget(e.target.value)} />
          <button
            type="button"
            className="btn-secondary"
            disabled={!freeTarget.trim()}
            onClick={() => {
              setStance(freeKind, freeTarget.trim(), "do_not_match");
              setFreeTarget("");
            }}
          >
            Add
          </button>
        </div>
        <p className="text-hint">Added entries start as &quot;Do not match me&quot;; change the stance in the list.</p>
      </section>
    </div>
  );
}

function Share({
  show,
  checked,
  onChange,
  disabled,
}: {
  show: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  if (!show) return null;
  return (
    <label className="chip min-h-9 shrink-0 text-xs">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {disabled ? "Private" : "Share with organizations"}
    </label>
  );
}

function Review({
  draft,
  setDraft,
  consentText,
  formAction,
  pending,
  state,
}: {
  draft: FitPreferences;
  setDraft: (d: FitPreferences) => void;
  consentText: string;
  formAction: (fd: FormData) => void;
  pending: boolean;
  state: ConsentState;
}) {
  const mode = VISIBILITY_OPTIONS.find((o) => o.value === draft.visibilityMode)!;
  const [expiryOption, setExpiryOption] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState("");
  const expiry: ExpiryChoice | null =
    expiryOption === "6" || expiryOption === "12"
      ? { kind: "months", months: Number(expiryOption) as 6 | 12 }
      : expiryOption === "date" && expiryDate
        ? { kind: "date", date: expiryDate }
        : expiryOption === "none"
          ? { kind: "none" }
          : null;
  const canShare = SHARING_MODES.includes(draft.visibilityMode);


  const row = (label: string, share: React.ReactNode, key: string) => (
    <li key={key} className="flex flex-col gap-2 py-2 text-sm text-fg sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      {share}
    </li>
  );

  const empty = <p className="text-sm text-subtle">Not answered</p>;
  // Preview as an organization the worker applied to, whose campaign agrees
  // with each of the worker's positions (the most that could ever show).
  const bestCase = {
    issues: Object.fromEntries(
      Object.entries(draft.issuePositions ?? {}).flatMap(([k, a]) =>
        a.position.includes("support") ? [[k, "support"]] : a.position.includes("oppose") ? [[k, "oppose"]] : []
      )
    ),
  };
  const preview = employerFitView(draft, { orgHasRelationship: true, campaign: bestCase });

  return (
    <div className="space-y-4">
      <div className={box}>
        <p className="fieldset-title">Visibility</p>
        <span className="badge-accent">{mode.label}</span>
        <p className="text-muted-sm mt-2">{mode.description}</p>
        {canShare && (
          <p className="text-hint mt-2">Approve each answer below that organizations may see. Nothing is shared unless you tick it.</p>
        )}
      </div>

      <section className={box}>
        <h3 className="fieldset-title">Identity labels</h3>
        {draft.identityLabels ? (
          <ul>
            {draft.identityLabels.map((a, i) =>
              row(
                identityText(a),
                <Share
                  show={canShare}
                  checked={!!a.shared}
                  onChange={(v) => setDraft({ ...draft, identityLabels: draft.identityLabels!.map((x, j) => (j === i ? { ...x, shared: v || undefined } : x)) })}
                />,
                `${a.label}:${a.text ?? ""}`
              )
            )}
          </ul>
        ) : empty}
      </section>

      <section className={box}>
        <h3 className="fieldset-title">Party relationship</h3>
        {draft.partyRelationship ? (
          <ul>
            {row(
              partyText(draft.partyRelationship),
              <Share show={canShare} checked={!!draft.partyRelationship.shared} onChange={(v) => setDraft({ ...draft, partyRelationship: { ...draft.partyRelationship!, shared: v || undefined } })} />,
              "party"
            )}
          </ul>
        ) : empty}
      </section>

      <section className={box}>
        <h3 className="fieldset-title">Issue positions</h3>
        {draft.issuePositions ? (
          <ul>
            {Object.entries(draft.issuePositions).map(([k, a]) =>
              row(
                issueText(k, a),
                <Share
                  show={canShare}
                  checked={!!a.shared}
                  disabled={a.position === "private"}
                  onChange={(v) => setDraft({ ...draft, issuePositions: { ...draft.issuePositions, [k]: { ...a, shared: v || undefined } } })}
                />,
                k
              )
            )}
          </ul>
        ) : empty}
        {canShare && (
          <p className="text-hint mt-2">
            Organizations never see this list. A shared position only appears as agreement with a position the campaign has publicly disclosed.
          </p>
        )}
      </section>

      <section className={box}>
        <h3 className="fieldset-title">Campaign boundaries</h3>
        {draft.campaignBoundaries ? (
          <ul>
            {draft.campaignBoundaries.map((b, i) =>
              row(
                boundaryText(b),
                b.stance === "actively_interested" || b.stance === "open_to" ? (
                  <Share
                  show={canShare}
                    checked={!!b.shared}
                    onChange={(v) => setDraft({ ...draft, campaignBoundaries: draft.campaignBoundaries!.map((x, j) => (j === i ? { ...x, shared: v || undefined } : x)) })}
                  />
                ) : canShare ? (
                  <span className="text-hint">Used for matching only</span>
                ) : null,
                `${b.kind}:${b.target}`
              )
            )}
          </ul>
        ) : empty}
      </section>

      <div className="card-flat">
        <p className="font-medium text-fg">Preview: what organizations see</p>
        <p className="text-hint mt-1">
          {canShare && draft.visibilityMode === "APPLIED_TO"
            ? "An organization you applied to, if its campaign agreed with every position you shared:"
            : "Every organization:"}
        </p>
        <dl className="mt-3 divide-y divide-border text-sm">
          {FIT_FIELDS.map((f) => {
            const v = draft.visibilityMode === "APPLIED_TO" ? preview.fields[f.key] : { shared: false as const };
            return (
              <div key={f.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-muted">{f.label}</dt>
                <dd className="text-fg sm:text-right">{v.shared ? v.lines.join(" · ") : "Not shared"}</dd>
              </div>
            );
          })}
        </dl>
        {draft.visibilityMode === "APPLIED_TO" && (
          <p className="text-hint mt-2">Every other organization sees &quot;not shared&quot; for everything.</p>
        )}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="payload" value={JSON.stringify(draft)} />
        <input type="hidden" name="expiry" value={JSON.stringify(expiry)} />
        <fieldset className="card space-y-2">
          <legend className="fieldset-title px-1">When should this consent expire?</legend>
          {EXPIRY_OPTIONS.map((o) => (
            <label key={o.value} className="option-card items-center py-3 text-sm text-fg">
              <input type="radio" name="expiryOption" value={o.value} checked={expiryOption === o.value} onChange={() => setExpiryOption(o.value)} />
              {o.label}
            </label>
          ))}
          {expiryOption === "date" && (
            <input type="date" className={input} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
          )}
          <p className="text-hint">
            After it expires, organizations see &quot;not shared&quot; and nothing is used for matching until you reconfirm.
          </p>
        </fieldset>
        <label className="card flex gap-3 text-sm leading-relaxed text-fg">
          <input type="checkbox" name="consent" value="yes" required />
          <span>{consentText}</span>
        </label>
        <button type="submit" disabled={pending || !expiry} className="btn-primary w-full sm:w-auto">
          {pending ? "Saving…" : "I consent — save"}
        </button>
        <p aria-live="polite" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      </form>
    </div>
  );
}
