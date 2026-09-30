"use client";

import { useActionState, useState } from "react";
import { consentToPreferences, type ConsentState } from "@/app/profile/preferences/actions";
import {
  describeBoundaries,
  describeIdentity,
  describeIssues,
  describeParty,
  employerFitView,
  FIT_FIELDS,
  FLOW_STEPS,
  IDENTITY_LABELS,
  ISSUES,
  LEANS,
  PARTIES,
  POSITIONS,
  SIDES,
  VISIBILITY_OPTIONS,
  type FitPreferences,
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

const box = "rounded-lg border p-3";
const select = "rounded-lg border bg-transparent px-2 py-1 text-sm";

export function PreferencesFlow({
  initial,
  consentText,
}: {
  initial: FitPreferences | null;
  consentText: string;
}) {
  const [step, setStep] = useState(0);
  // Starts from the worker's own latest answers, or from nothing. There are
  // no pre-selected answers: the worker must pick every value themselves.
  const [draft, setDraft] = useState<Draft>(
    initial ?? {
      visibilityMode: null,
      identityLabels: null,
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    }
  );
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(
    consentToPreferences,
    { ok: false, message: "" }
  );

  const key = FLOW_STEPS[step];
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = <T,>(list: T[] | null | undefined, v: T) =>
    list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v];
  const skip = (patch: Partial<Draft>) => {
    set(patch);
    setStep((s) => s + 1);
  };

  const boundaries = draft.campaignBoundaries ?? { willNotWorkFor: [], willNotWorkOn: [] };
  const hasSide = (issue: string, side: string) =>
    boundaries.willNotWorkOn.some((x) => x.issue === issue && x.side === side);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs">
        {FLOW_STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full border px-2 py-1 ${i === step ? "bg-black text-white dark:bg-white dark:text-black" : i < step ? "" : "text-neutral-400"}`}
          >
            {i + 1}. {STEP_TITLES[s]}
          </li>
        ))}
      </ol>

      <h2 className="text-lg font-semibold">{STEP_TITLES[key]}</h2>

      {key === "visibility" && (
        <fieldset className="space-y-2">
          <legend className="sr-only">Visibility</legend>
          {VISIBILITY_OPTIONS.map((o) => (
            <label key={o.value} className={`${box} flex gap-3`}>
              <input
                type="radio"
                name="visibility"
                checked={draft.visibilityMode === o.value}
                onChange={() => set({ visibilityMode: o.value })}
              />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-sm text-neutral-600 dark:text-neutral-400">{o.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {key === "identity" && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Pick any that describe you, or none.</p>
          <div className="flex flex-wrap gap-2">
            {IDENTITY_LABELS.map((l) => (
              <label key={l} className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={draft.identityLabels?.includes(l) ?? false}
                  onChange={() => {
                    const next = toggle(draft.identityLabels, l);
                    set({ identityLabels: next.length ? next : null });
                  }}
                />
                {l}
              </label>
            ))}
          </div>
        </div>
      )}

      {key === "party" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Registered as</span>
            <select
              className={`${select} w-full`}
              value={draft.partyRelationship?.registered ?? ""}
              onChange={(e) => {
                const registered = (e.target.value || null) as (typeof PARTIES)[number] | null;
                const leans = draft.partyRelationship?.leans ?? null;
                set({ partyRelationship: registered || leans ? { registered, leans } : null });
              }}
            >
              <option value="">Prefer not to answer</option>
              {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Usually leans</span>
            <select
              className={`${select} w-full`}
              value={draft.partyRelationship?.leans ?? ""}
              onChange={(e) => {
                const leans = (e.target.value || null) as (typeof LEANS)[number] | null;
                const registered = draft.partyRelationship?.registered ?? null;
                set({ partyRelationship: registered || leans ? { registered, leans } : null });
              }}
            >
              <option value="">Prefer not to answer</option>
              {LEANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
      )}

      {key === "issues" && (
        <ul className="divide-y rounded-lg border">
          {ISSUES.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-2 p-2">
              <span className="text-sm">{i.label}</span>
              <select
                className={select}
                value={draft.issuePositions?.[i.key] ?? ""}
                onChange={(e) => {
                  const next = { ...(draft.issuePositions ?? {}) };
                  if (e.target.value) next[i.key] = e.target.value as (typeof POSITIONS)[number];
                  else delete next[i.key];
                  set({ issuePositions: Object.keys(next).length ? next : null });
                }}
              >
                <option value="">Prefer not to answer</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      {key === "boundaries" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">I won&apos;t work for campaigns run by</p>
            <div className="flex flex-wrap gap-2">
              {PARTIES.filter((p) => p !== "not registered" && p !== "unaffiliated").map((p) => (
                <label key={p} className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={boundaries.willNotWorkFor.includes(p)}
                    onChange={() => {
                      const next = { ...boundaries, willNotWorkFor: toggle(boundaries.willNotWorkFor, p) };
                      set({ campaignBoundaries: next.willNotWorkFor.length || next.willNotWorkOn.length ? next : null });
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">I won&apos;t campaign to…</p>
            <ul className="divide-y rounded-lg border">
              {ISSUES.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                  <span>{i.label}</span>
                  <span className="flex gap-3">
                    {SIDES.map((side) => (
                      <label key={side} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={hasSide(i.key, side)}
                          onChange={() => {
                            const on = hasSide(i.key, side)
                              ? boundaries.willNotWorkOn.filter((x) => !(x.issue === i.key && x.side === side))
                              : [...boundaries.willNotWorkOn, { issue: i.key, side }];
                            const next = { ...boundaries, willNotWorkOn: on };
                            set({ campaignBoundaries: next.willNotWorkFor.length || next.willNotWorkOn.length ? next : null });
                          }}
                        />
                        {side}
                      </label>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {key === "review" && draft.visibilityMode && (
        <Review draft={draft as FitPreferences} consentText={consentText} formAction={formAction} pending={pending} state={state} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {key !== "review" && (
          <button
            type="button"
            disabled={key === "visibility" && !draft.visibilityMode}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
            onClick={() => setStep(step + 1)}
          >
            Next
          </button>
        )}
        {key === "identity" && (
          <button type="button" className="text-sm underline" onClick={() => skip({ identityLabels: null })}>Prefer not to answer</button>
        )}
        {key === "party" && (
          <button type="button" className="text-sm underline" onClick={() => skip({ partyRelationship: null })}>Prefer not to answer</button>
        )}
        {key === "issues" && (
          <button type="button" className="text-sm underline" onClick={() => skip({ issuePositions: null })}>Prefer not to answer</button>
        )}
        {key === "boundaries" && (
          <button type="button" className="text-sm underline" onClick={() => skip({ campaignBoundaries: null })}>No boundaries</button>
        )}
      </div>
    </div>
  );
}

function Review({
  draft,
  consentText,
  formAction,
  pending,
  state,
}: {
  draft: FitPreferences;
  consentText: string;
  formAction: (fd: FormData) => void;
  pending: boolean;
  state: ConsentState;
}) {
  const mode = VISIBILITY_OPTIONS.find((o) => o.value === draft.visibilityMode)!;
  const answers: Array<[string, string[] | string | null]> = [
    ["Identity labels", describeIdentity(draft)],
    ["Party relationship", describeParty(draft)],
    ["Issue positions", describeIssues(draft)],
    ["Campaign boundaries", describeBoundaries(draft)],
  ];
  const applied = employerFitView(draft, { orgHasRelationship: true });

  return (
    <div className="space-y-4">
      <div className={box}>
        <p className="text-sm text-neutral-500">Visibility</p>
        <p className="font-medium">{mode.label}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{mode.description}</p>
      </div>

      <dl className="divide-y rounded-lg border">
        {answers.map(([label, v]) => (
          <div key={label} className="p-3">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm">
              {v === null ? <span className="text-neutral-400">Not answered</span> : Array.isArray(v) ? v.join(" · ") : v}
            </dd>
          </div>
        ))}
      </dl>

      <div className={box}>
        <p className="text-sm font-medium">What organizations will see</p>
        <ul className="mt-1 space-y-1 text-sm">
          {draft.visibilityMode === "APPLIED_TO" && (
            <li>
              Organizations you apply to or accept an invitation from:{" "}
              {FIT_FIELDS.map((f) => `${f.label} ${applied.fields[f.key].shared ? "shared" : "not shared"}`).join(" · ")}
            </li>
          )}
          <li>
            {draft.visibilityMode === "APPLIED_TO" ? "Every other organization" : "Every organization"}: &quot;not
            shared&quot; for everything, the same as for anyone who keeps their answers private.
          </li>
        </ul>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="payload" value={JSON.stringify(draft)} />
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="consent" value="yes" required />
          <span>{consentText}</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Saving…" : "I consent — save"}
        </button>
        <p aria-live="polite" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>
      </form>
    </div>
  );
}
