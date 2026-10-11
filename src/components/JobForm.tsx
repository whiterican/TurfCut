"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { saveJob, type JobFormState } from "@/app/jobs/actions";
import { AFFILIATIONS, affiliationLabel, COMPENSATION_METHODS, formToObject, HIRING_MODES, JOB_TYPES, validateJob } from "@/lib/jobs";
import { BUILDER_STEPS, errorsForStep, firstStepWithErrors, REVIEW_STEP, stepOfField } from "@/lib/job-builder";
import { LAUNCH_MODES, readLaunch } from "@/lib/job-launch";
import { CAMPAIGN_TYPES, ISSUES } from "@/lib/political-fit";
import { US_STATES } from "@/lib/experience";
import { StagingPointsEditor } from "@/components/StagingPointsEditor";

const initial: JobFormState = { message: "", errors: {} };
const optional = <span className="font-normal text-subtle">(optional)</span>;
const FIX = "Fix the highlighted fields.";

export interface JurisdictionOption {
  id: string;
  label: string;
  problems: string[];
}

/**
 * The job builder (C4.1): six steps over one form. Every step stays in the
 * form (hidden when it isn't the current one), so one save sends it all.
 * Next checks the current step's fields with the same validator the server
 * runs, and jumping ahead checks every step on the way; the review reads
 * the form afresh each time it opens, each line pointing back to its step.
 * The form is submitted inside our own transition, so React doesn't reset
 * it when the server answers with a problem; that answer sends the builder
 * back to the step it belongs to. Saves a draft only — publishing is a
 * separate step that runs the jurisdiction hard stop. Campaign positions
 * use the same issue list workers answer with, so overlap is a direct
 * comparison.
 */
export function JobForm({
  jobId,
  defaults = {},
  jurisdictions,
}: {
  jobId?: string;
  defaults?: Record<string, unknown>;
  jurisdictions: JurisdictionOption[];
}) {
  const [state, action, pending] = useActionState(saveJob, initial);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  // Editing a saved draft: every step is open from the start.
  const [visited, setVisited] = useState(jobId ? REVIEW_STEP : 0);
  // Problems to show: the browser's own check, or the server's answer. A
  // step that passes drops its own; the message goes when none are left.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  // What the review shows: read from the form each time it opens.
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  // The server's answer sends the builder to the step it belongs to (state
  // adjusted while rendering, as React suggests, when the answer is new).
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    setErrors(state.errors);
    setMessage(state.message);
    const serverStep = firstStepWithErrors(state.errors);
    if (serverStep !== null) setStep(serverStep);
  }
  // Focus the step heading on a change of step, not on first paint.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  const d = (k: string, fallback = "") => (typeof defaults[k] === "string" ? (defaults[k] as string) : fallback);
  const modes = Array.isArray(defaults.hiringModes) ? (defaults.hiringModes as string[]) : ["application"];
  const launch = readLaunch(launchDefaults(defaults));
  const [launchMode, setLaunchMode] = useState(launch.mode);
  const stepErrors = errorsForStep(errors, step);
  const err = (k: string) => (stepErrors[k] ? <p id={`err-${k}`} className="field-error">{stepErrors[k]}</p> : null);
  const describe = (k: string) => (stepErrors[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {});
  // A problem on this step that no field shows (an unexpected key): listed under the heading.
  const loose = Object.entries(stepErrors).filter(([k]) => !BUILDER_STEPS[step].fields.includes(k) && !k.startsWith("issue_") && !k.startsWith("point_"));

  const read = () => formToObject(new FormData(form.current!));
  const goTo = (n: number) => {
    if (!form.current) return;
    if (n > step) {
      // Every step on the way has to pass; the first that doesn't is shown.
      const r = validateJob(read());
      const stop = r.ok ? null : [...Array(n - step).keys()].map((i) => step + i).find((i) => Object.keys(errorsForStep(r.errors, i)).length) ?? null;
      const keep = (k: string) => stepOfField(k) < step || stepOfField(k) >= (stop ?? n);
      setErrors((e) => ({ ...Object.fromEntries(Object.entries(e).filter(([k]) => keep(k))), ...(r.ok || stop === null ? {} : errorsForStep(r.errors, stop)) }));
      if (stop !== null) {
        setMessage(FIX);
        setStep(stop);
        queueMicrotask(() => focusFirstProblem(form.current));
        return;
      }
      setMessage((m) => (m === FIX ? "" : m));
    }
    if (n === REVIEW_STEP) setSummary(read());
    setStep(n);
    setVisited((v) => Math.max(v, n));
  };
  // Keyed apart from the save button and with the default stopped: React
  // re-renders the button before the browser runs the click's default
  // action, which would otherwise submit the form from the last step.
  const next = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    goTo(step + 1);
  };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  const current = BUILDER_STEPS[step];
  const show = (i: number) => (i === step ? undefined : true); // `hidden` attribute

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      className="space-y-6"
      onKeyDown={(e) => {
        // Enter in a field goes to the next step, as it would submit a one-page form.
        if (e.key === "Enter" && step < REVIEW_STEP && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          goTo(step + 1);
        }
      }}
    >
      {jobId && <input type="hidden" name="jobId" value={jobId} />}

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {BUILDER_STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`step ${i === step ? "step-current" : i <= visited ? "step-done" : ""}`}
              aria-current={i === step ? "step" : undefined}
              aria-disabled={i > visited || undefined}
              onClick={() => i <= visited && goTo(i)}
            >
              <span aria-hidden>{i + 1}.</span> {s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-1">
        <h2 ref={heading} tabIndex={-1} className="section-title rounded-md focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          Step {step + 1} of {BUILDER_STEPS.length}: {current.title}
        </h2>
        <p className="text-muted-sm">{current.blurb}</p>
        {loose.length > 0 && (
          <ul className="field-error list-disc pl-5">
            {loose.map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        )}
      </div>

      <fieldset hidden={show(0)} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">The work</legend>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Title</span>
          <input name="title" className="field" required maxLength={120} defaultValue={d("title")} {...describe("title")} />
          {err("title")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Type</span>
          <select name="type" className="field" defaultValue={d("type", "PETITION")} {...describe("type")}>
            {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {err("type")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Jurisdiction rule profile</span>
          <select name="jurisdictionId" className="field" defaultValue={d("jurisdictionId")} required {...describe("jurisdictionId")}>
            <option value="" disabled>Choose…</option>
            {jurisdictions.map((j) => (
              <option key={j.id} value={j.id}>{j.label}{j.problems.length ? " — can't publish" : ""}</option>
            ))}
          </select>
          {err("jurisdictionId")}
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Description {optional}</span>
          <textarea name="description" className="field min-h-24" maxLength={2000} defaultValue={d("description")} {...describe("description")} />
          {err("description")}
        </label>
      </fieldset>

      <fieldset hidden={show(1)} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">When and where</legend>
        <label className="space-y-1.5">
          <span className="label">Starts</span>
          <input type="date" name="startsAt" className="field" required defaultValue={d("startsAt")} {...describe("startsAt")} />
          {err("startsAt")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Ends</span>
          <input type="date" name="endsAt" className="field" required defaultValue={d("endsAt")} {...describe("endsAt")} />
          {err("endsAt")}
        </label>
        <label className="space-y-1.5">
          <span className="label">City</span>
          <input name="city" className="field" required maxLength={80} defaultValue={d("city")} {...describe("city")} />
          {err("city")}
        </label>
        <label className="space-y-1.5">
          <span className="label">State</span>
          <select name="state" className="field" defaultValue={d("state")} required {...describe("state")}>
            <option value="" disabled>—</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {err("state")}
        </label>
        <p className="text-hint sm:col-span-2">The state must match the jurisdiction rule profile from step 1; the draft is checked when it&apos;s saved.</p>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="label">How each day starts</legend>
          {LAUNCH_MODES.map((m) => (
            <label key={m.value} className="flex items-start gap-2 text-sm">
              <input type="radio" name="launchMode" value={m.value} checked={launchMode === m.value} onChange={() => setLaunchMode(m.value)} className="mt-0.5 size-4" {...describe("launchMode")} />
              <span>
                <span className="font-medium text-fg">{m.label}</span>
                <span className="block text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
          {err("launchMode")}
        </fieldset>
        {launchMode === "STAGED" && <StagingPointsEditor initial={launch.points} errors={stepErrors} describe={describe} />}
      </fieldset>

      <fieldset hidden={show(2)} className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Pay and hiring</legend>
        <label className="space-y-1.5">
          <span className="label">Paid</span>
          <select name="compensationMethod" className="field" defaultValue={d("compensationMethod", "HOURLY")} {...describe("compensationMethod")}>
            {COMPENSATION_METHODS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("compensationMethod")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Gross rate ($)</span>
          <input name="payRate" inputMode="decimal" className="field" required defaultValue={d("payRate")} placeholder="25.00" {...describe("payRate")} />
          {err("payRate")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Headcount</span>
          <input name="headcount" inputMode="numeric" className="field" required defaultValue={d("headcount")} {...describe("headcount")} />
          {err("headcount")}
        </label>
        <div className="space-y-1.5 sm:col-span-3">
          <span className="label">How you hire</span>
          <div className="flex flex-wrap gap-2">
            {HIRING_MODES.map((m) => (
              <label key={m.value} className="chip">
                <input type="checkbox" name="hiringModes" value={m.value} defaultChecked={modes.includes(m.value)} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
          {err("hiringModes")}
        </div>
        <label className="space-y-1.5 sm:col-span-3">
          <span className="label">Cancellation notice (hours)</span>
          <input name="cancellationNoticeHours" inputMode="numeric" className="field sm:max-w-40" defaultValue={d("cancellationNoticeHours", "24")} {...describe("cancellationNoticeHours")} />
          <p className="text-hint">A worker cancelling a shift with less notice than this counts as a no-show on their scorecard.</p>
          {err("cancellationNoticeHours")}
        </label>
      </fieldset>

      <fieldset hidden={show(3)} className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Requirements and contacts</legend>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          {[
            ["registration", "Circulator registration"],
            ["badge", "Badge"],
            ["affidavit", "Signed affidavit"],
          ].map(([k, label]) => (
            <label key={k} className="chip">
              <input type="checkbox" name={k} defaultChecked={defaults[k] === "on"} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-hint sm:col-span-3">The jurisdiction&apos;s own requirements are added to the job card automatically.</p>
        <label className="space-y-1.5">
          <span className="label">Training {optional}</span>
          <input name="training" className="field" maxLength={120} defaultValue={d("training")} {...describe("training")} />
          {err("training")}
        </label>
        <label className="space-y-1.5 sm:col-span-3">
          <span className="label">Script {optional}</span>
          <textarea name="script" className="field min-h-24" maxLength={4000} defaultValue={d("script")} {...describe("script")} />
          {err("script")}
        </label>
        <p className="label sm:col-span-3">Who handles problems</p>
        <label className="space-y-1.5">
          <span className="label">Emergencies</span>
          <input name="contactEmergency" className="field" required maxLength={200} defaultValue={d("contactEmergency")} {...describe("contactEmergency")} />
          {err("contactEmergency")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Pay disputes</span>
          <input name="contactDisputes" className="field" required maxLength={200} defaultValue={d("contactDisputes")} {...describe("contactDisputes")} />
          {err("contactDisputes")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Lost materials</span>
          <input name="contactLostMaterials" className="field" required maxLength={200} defaultValue={d("contactLostMaterials")} {...describe("contactLostMaterials")} />
          {err("contactLostMaterials")}
        </label>
      </fieldset>

      <fieldset hidden={show(4)} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Campaign disclosure</legend>
        <p className="text-muted-sm sm:col-span-2">
          Workers see this before they apply. Issue positions you disclose are the only basis for &ldquo;issue overlap&rdquo; —
          and only with workers who chose to share theirs.
        </p>
        <label className="space-y-1.5">
          <span className="label">Campaign type</span>
          <select name="campaignType" className="field" defaultValue={d("campaignType")} required {...describe("campaignType")}>
            <option value="" disabled>Choose…</option>
            {CAMPAIGN_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {err("campaignType")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Affiliation</span>
          <select name="affiliation" className="field" defaultValue={d("affiliation")} required {...describe("affiliation")}>
            <option value="" disabled>Choose…</option>
            {AFFILIATIONS.map((a) => <option key={a} value={a}>{affiliationLabel(a)}</option>)}
          </select>
          {err("affiliation")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Candidate or measure name {optional}</span>
          <input name="campaignName" className="field" maxLength={120} defaultValue={d("campaignName")} {...describe("campaignName")} />
          {err("campaignName")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Ballot measure IDs {optional}</span>
          <input name="measureIds" className="field" defaultValue={d("measureIds")} placeholder="I-305, I-12" {...describe("measureIds")} />
          {err("measureIds")}
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="label">Campaign message</span>
          <textarea name="message" className="field min-h-20" required maxLength={500} defaultValue={d("message")} {...describe("message")} />
          {err("message")}
        </label>
        <div className="space-y-2 sm:col-span-2">
          <span className="label">Public issue positions {optional}</span>
          <div className="list-card">
            {ISSUES.map((i) => (
              <label key={i.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-fg">{i.label}</span>
                <select name={`issue_${i.key}`} className="field max-w-36" defaultValue={d(`issue_${i.key}`)}>
                  <option value="">Not disclosed</option>
                  <option value="support">Support</option>
                  <option value="oppose">Oppose</option>
                </select>
              </label>
            ))}
          </div>
          {err("issues")}
        </div>
      </fieldset>

      {step === REVIEW_STEP && <Review raw={summary} jurisdictions={jurisdictions} goTo={goTo} />}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" className="btn-ghost" onClick={() => goTo(step - 1)}>
            ← Back
          </button>
        )}
        {step < REVIEW_STEP ? (
          <button key="next" type="button" className="btn-primary" onClick={next}>
            Next: {BUILDER_STEPS[step + 1].title}
          </button>
        ) : (
          <button key="save" className="btn-primary" disabled={pending}>{pending ? "Saving…" : jobId ? "Save draft" : "Create draft"}</button>
        )}
        {/* Always present, so a change of text is announced. */}
        <p role="status" aria-live="polite" className="text-danger-msg">{message}</p>
      </div>
    </form>
  );
}

/** The launch among the form defaults (jobToForm's launchToForm fields), in the stored shape readLaunch reads. */
function launchDefaults(defaults: Record<string, unknown>): unknown {
  if (typeof defaults.launchMode !== "string") return null;
  const points = [];
  for (let i = 0; typeof defaults[`point_${i}_name`] === "string"; i++) {
    points.push({ id: defaults[`point_${i}_id`], name: defaults[`point_${i}_name`], address: defaults[`point_${i}_address`] || null, lat: Number(defaults[`point_${i}_lat`]), lng: Number(defaults[`point_${i}_lng`]), radiusM: Number(defaults[`point_${i}_radius`]) });
  }
  return { mode: defaults.launchMode, points };
}

/** Moves focus to the first field with a problem on the shown step, else the heading. */
function focusFirstProblem(form: HTMLFormElement | null) {
  if (!form) return;
  (form.querySelector<HTMLElement>('fieldset:not([hidden]) [aria-invalid="true"]') ?? form.querySelector<HTMLElement>("h2"))?.focus();
}

/** What was entered, step by step, each with a way back to change it. */
function Review({ raw, jurisdictions, goTo }: { raw: Record<string, unknown>; jurisdictions: JurisdictionOption[]; goTo: (n: number) => void }) {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const list = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as string[]) : s(k) ? [s(k)] : []);
  const labelOf = (xs: readonly { value: string; label: string }[], v: string) => xs.find((x) => x.value === v)?.label ?? v;
  const on = (k: string) => raw[k] === "on";
  const issues = ISSUES.filter((i) => s(`issue_${i.key}`)).map((i) => `${i.label}: ${s(`issue_${i.key}`)}`);
  const points: string[] = [];
  for (let i = 0; `point_${i}_name` in raw; i++) if (s(`point_${i}_name`)) points.push(`${s(`point_${i}_name`)} (${s(`point_${i}_radius`) || "250"} m)`);
  const launchText = s("launchMode") === "SELF" ? "Self-launch: workers start from wherever they are" : points.length ? `Staged: ${points.join(", ")}` : "Staged, no staging point yet (needed to publish)";
  const rows: Array<{ step: number; label: string; value: string }> = [
    { step: 0, label: "Title", value: s("title") },
    { step: 0, label: "Type", value: labelOf(JOB_TYPES, s("type")) },
    { step: 0, label: "Jurisdiction", value: jurisdictions.find((j) => j.id === s("jurisdictionId"))?.label ?? "—" },
    { step: 0, label: "Description", value: s("description") || "—" },
    { step: 1, label: "Dates", value: `${s("startsAt") || "—"} to ${s("endsAt") || "—"}` },
    { step: 1, label: "Where", value: [s("city"), s("state")].filter(Boolean).join(", ") || "—" },
    { step: 1, label: "How each day starts", value: launchText },
    { step: 2, label: "Pay", value: `$${s("payRate") || "—"} ${labelOf(COMPENSATION_METHODS, s("compensationMethod")).toLowerCase() || "—"}` },
    { step: 2, label: "Headcount", value: s("headcount") || "—" },
    { step: 2, label: "Hiring", value: list("hiringModes").map((m) => labelOf(HIRING_MODES, m)).join(", ") || "—" },
    { step: 2, label: "Cancellation notice", value: `${s("cancellationNoticeHours") || "24"} hours` },
    { step: 3, label: "Requirements", value: [on("registration") && "Circulator registration", on("badge") && "Badge", on("affidavit") && "Signed affidavit", s("training") && `Training: ${s("training")}`].filter(Boolean).join(", ") || "None beyond the jurisdiction's" },
    { step: 3, label: "Script", value: s("script") || "—" },
    { step: 3, label: "Contacts", value: `Emergencies: ${s("contactEmergency") || "—"} · Disputes: ${s("contactDisputes") || "—"} · Lost materials: ${s("contactLostMaterials") || "—"}` },
    { step: 4, label: "Campaign", value: `${labelOf(CAMPAIGN_TYPES, s("campaignType")) || "—"} · ${s("affiliation") ? affiliationLabel(s("affiliation")) : "—"}${s("campaignName") ? ` · ${s("campaignName")}` : ""}` },
    { step: 4, label: "Ballot measure IDs", value: s("measureIds") || "—" },
    { step: 4, label: "Message", value: s("message") || "—" },
    { step: 4, label: "Issue positions", value: issues.join(", ") || "None disclosed" },
  ];
  return (
    <section className="space-y-3" aria-label="Review">
      <dl className="list-card">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <dt className="text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line text-fg sm:text-right">{r.value}</dd>
            <dd>
              <button type="button" className="link text-sm" onClick={() => goTo(r.step)}>
                Change<span className="sr-only"> {r.label}</span>
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-hint">Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction&apos;s rules.</p>
    </section>
  );
}
