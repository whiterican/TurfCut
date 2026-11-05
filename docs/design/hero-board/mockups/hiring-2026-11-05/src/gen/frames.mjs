// The proposed frames. Each returns the <main> for a width; the shell around
// it is the app's own (see build.mjs). Only the markup here is proposed; it
// uses the app's class names and the few rules in ../proposed.css. Every
// string that is today's copy is picked from a harvested part or quoted from
// the source line named in ../../MAP.md; new copy is marked in PLAN.md Q9.

const STEPS = ["The work", "When and where", "Pay and hiring", "Requirements and contacts", "Campaign disclosure", "Review"];
const BLURBS = ["What the job is and where its rules come from.", "The dates, the city, and how each day starts.", "What it pays, how many people, and how they get in.", "What workers must hold, the app the work runs in, and who they call when something goes wrong.", "What workers see about the campaign before they apply.", "Check everything, then save the draft."];
const JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";

/* ---------- shared pieces ---------- */

/** The step track: today's buttons in one row: the current step (.step-current), the steps already reached (.step-done, as JobForm.tsx:290), the rest plain and aria-disabled. */
function track(current, reached) {
  return `<ol class="step-track" aria-label="Steps">${STEPS.map((t, i) => `<li><button type="button" class="step ${i === current ? "step-current" : i <= reached ? "step-done" : ""}" ${i === current ? 'aria-current="step"' : ""} ${i > reached ? 'aria-disabled="true"' : ""}><span aria-hidden="true">${i + 1}.</span> ${t}</button></li>`).join("")}</ol>`;
}
const stepHead = (i) => `<div class="space-y-1"><h2 tabindex="-1" class="section-title rounded-md focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Step ${i + 1} of 6: ${STEPS[i]}</h2><p class="text-muted-sm">${BLURBS[i]}</p></div>`;
const saveLine = (text) => `<p role="status" aria-live="polite" class="text-hint">${text}</p>`;
const summary = (items) => `<div class="problem-summary" tabindex="-1" role="group" aria-labelledby="problems"><p id="problems">${items.length} ${items.length === 1 ? "thing" : "things"} to fix on this step</p><ul class="text-sm">${items.map(([id, t]) => `<li><a class="link" href="#${id}">${t}</a></li>`).join("")}</ul></div>`;
const nextRow = (i, { width, msg = "" }) => i < 5
  ? `<div class="flex flex-wrap items-center gap-3"><button type="button" class="btn-primary${width < 600 ? " w-full" : ""}">Next: ${STEPS[i + 1]}</button>${i > 0 ? '<button type="button" class="btn-ghost"><svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>Back</button>' : ""}<p role="status" aria-live="polite" class="text-danger-msg">${msg}</p></div>`
  : `<div class="flex flex-wrap items-center gap-3"><button class="btn-primary${width < 600 ? " w-full" : ""}">${msg}</button><button type="button" class="btn-ghost"><svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>Back</button></div>`;
const masthead = ({ context, title, meta, actions = "", below = "" }) => `<div class="tpl-head"><header class="page-header"><div class="min-w-0 space-y-1.5">${context ? `<p class="masthead-context">${context}</p>` : ""}<h1 class="page-title masthead break-words">${title}</h1>${meta ? `<div class="text-muted-sm max-w-prose">${meta}</div>` : ""}${below}</div>${actions ? `<div class="flex flex-wrap gap-2">${actions}</div>` : ""}</header></div>`;
const reading = (head, body) => `<main class="tpl" data-template="reading" data-org="true" style="--tpl-gap:2.5rem">${head}<div class="tpl-body"><div class="tpl-main">${body}</div></div></main>`;
const record = (head, body, side = "") => `<main class="tpl" data-template="record" data-org="true" style="--tpl-gap:2.5rem">${head}<div class="tpl-body"><div class="tpl-main">${body}</div>${side ? `<aside class="tpl-side">${side}</aside>` : ""}</div></main>`;
const workspace = (head, body) => `<main class="tpl" data-template="workspace" data-org="true" style="--tpl-gap:2.5rem">${head}<div class="tpl-body"><div class="tpl-main">${body}</div></div></main>`;

// The form alone, in the reading template's column (680px from 64rem). The optional side note (question 9) is not drawn: the
// column leaves no room beside it, and new copy is never drawn as a promise.
const builderPage = (title, context, lead, form, width) => reading(
  masthead({ context, title, actions: `<a class="btn-ghost" href="/jobs">Jobs</a>` }),
  `${lead ? `<p class="lead">${lead}</p>` : ""}<form class="builder-main space-y-6" novalidate>${form}</form>`
);
const LEAD = "Six short steps. Your draft saves as you go, from the first step, and is published from the job page once every check passes.";

/* ---------- builder ---------- */

async function builderStep1Errors({ pick }, width) {
  const fs = await pick("builder-new-errors", "form fieldset:nth-of-type(1)", { unhide: true });
  return builderPage("New job", null, LEAD,
    `${track(0, 0)}${saveLine("Your draft saves as you go.")}${stepHead(0)}${summary([["title", "Title is required."], ["jurisdictionId", "Pick a jurisdiction."]])}${fs}${nextRow(0, { width, msg: "Fix the highlighted fields." })}`,
    width);
}
async function builderStep1Saved({ pick }, width) {
  // The first save of a new job: the Aurora draft's own step 1 values (parts/builder-draft-step2), the only saved draft in the fixtures.
  const fs = await pick("builder-draft-step2", "form fieldset:nth-of-type(1)", { unhide: true });
  return builderPage("New job", null, LEAD, `${track(0, 0)}${saveLine("Draft saved 3:14 PM")}${stepHead(0)}${fs}${nextRow(0, { width })}`, width);
}
async function builderStep2({ pick }, width) {
  const fs = await pick("builder-draft-step2", "form fieldset:nth-of-type(2)", { unhide: true });
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(1, 5)}${saveLine("Draft saved 3:14 PM · 3 fields wait for a fix")}${stepHead(1)}${fs}${nextRow(1, { width })}`, width);
}
async function builderStep4({ pick }, width) {
  const fs = await pick("builder-draft-step4", "form fieldset:nth-of-type(4)", { unhide: true });
  const withErrors = fs.replace(/(<input class="field" required="" maxlength="200" name="contact(Emergency|Disputes|LostMaterials)"[^>]*)>/g, (m, a, k) => `${a} aria-invalid="true" aria-describedby="err-contact${k}"><p id="err-contact${k}" class="field-error">${{ Emergency: "Emergency contact is required.", Disputes: "Disputes contact is required.", LostMaterials: "Lost-materials contact is required." }[k]}</p>`);
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(3, 5)}${saveLine("Draft saved 3:14 PM · 3 fields wait for a fix")}${stepHead(3)}${summary([["contactEmergency", "Emergency contact is required."], ["contactDisputes", "Disputes contact is required."], ["contactLostMaterials", "Lost-materials contact is required."]])}${withErrors}${nextRow(3, { width, msg: "Fix the highlighted fields." })}`, width);
}
async function builderStep5({ pick }, width) {
  const fs = await pick("builder-draft-step5", "form fieldset:nth-of-type(5)", { unhide: true });
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(4, 5)}${saveLine("Draft saved 3:14 PM · 3 fields wait for a fix")}${stepHead(4)}${fs}${nextRow(4, { width })}`, width);
}
async function builderSaving({ pick }, width) {
  const fs = await pick("builder-draft-step2", "form fieldset:nth-of-type(3)", { unhide: true });
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(2, 5)}${saveLine("Saving draft…")}${stepHead(2)}${fs}${nextRow(2, { width })}`, width);
}
async function builderFailedSave({ pick }, width) {
  const fs = await pick("builder-draft-step2", "form fieldset:nth-of-type(3)", { unhide: true });
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(2, 5)}${saveLine("Couldn't save: couldn't reach Turfcut; it'll try again after your next change.")}${stepHead(2)}${fs}${nextRow(2, { width })}`, width);
}
const REVIEW_ROWS = [
  [0, "Title", "Aurora door knock, November"], [0, "Type", "Door-to-door canvassing"], [0, "Jurisdiction", "Boulder, CO (rules v1)"], [0, "Description", "Knock doors in Capitol Hill. Functional pass fixture."],
  [1, "Dates", "2026-11-05 to 2026-11-25"], [1, "Where", "Denver, CO"], [1, "How each day starts", "Staged, no staging point yet (needed to publish)"],
  [2, "Pay", "$24 hourly"], [2, "Headcount", "5"], [2, "Hiring", "Workers apply"], [2, "Cancellation notice", "24 hours"],
  [3, "Requirements", "None beyond the jurisdiction's"], [3, "Script", "—"], [3, "Canvassing app", "None"], [3, "Contacts", "Emergencies: — · Disputes: — · Lost materials: —"],
  [4, "Campaign", "— · —"], [4, "Ballot measure IDs", "—"], [4, "Message", "—"], [4, "Issue positions", "None disclosed"],
];
function review() {
  let out = '<section class="space-y-3" aria-label="Review">';
  let last = -1;
  for (const [s, label, value] of REVIEW_ROWS) {
    if (s !== last) { if (last !== -1) out += "</dl>"; out += `<h3 class="label mt-4">${s + 1} · ${STEPS[s]}</h3><dl class="list-card">`; last = s; }
    out += `<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"><dt class="text-muted">${label}</dt><dd class="min-w-0 flex-1 whitespace-pre-line text-fg sm:text-right">${value}</dd><dd><button type="button" class="link text-sm">Change<span class="sr-only"> ${label}</span></button></dd></div>`;
  }
  out += "</dl><p class=\"text-hint\">Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction's rules.</p></section>";
  return out;
}
async function builderReview(_, width) {
  return builderPage("Aurora door knock, November", "Edit draft", "", `${track(5, 5)}${saveLine("Draft saved 3:14 PM · 3 fields wait for a fix")}${stepHead(5)}${review()}${nextRow(5, { width, msg: "Save draft" })}`, width);
}
const LIVE_NOTICE = `<p class="alert-info">This job is live. Every change is recorded and everyone on the job is told. If you change the type of work, rule profile, dates, location, pay, requirements, the campaign, cancellation notice or how each day starts, workers already hired may leave within 24 hours with no effect on their reliability. The job has to stay publishable: a change that would fail a check is refused.</p>`;
async function builderLive({ pick }, width) {
  const fs = await pick("builder-live", "form fieldset:nth-of-type(1)", { unhide: true });
  return builderPage("Pass test canvass 390", "Edit published job", "", `${LIVE_NOTICE}${track(0, 5)}${saveLine("Changes save when you finish.")}${stepHead(0)}${fs}${nextRow(0, { width })}`, width);
}
async function builderLiveReview(_, width) {
  const rows = review().replace("Aurora door knock, November", "Pass test canvass 390").replace("Boulder, CO (rules v1)", "Denver, CO (rules v1)").replace("Staged, no staging point yet (needed to publish)", "Staged: Capitol Hill (250 m)").replace(">Workers apply<", ">Workers apply, We invite workers<").replace("Contacts</dt><dd class=\"min-w-0 flex-1 whitespace-pre-line text-fg sm:text-right\">Emergencies: — · Disputes: — · Lost materials: —", "Contacts</dt><dd class=\"min-w-0 flex-1 whitespace-pre-line text-fg sm:text-right\">Emergencies: Dana Field 303-555-0100 · Disputes: pay@passtest.org · Lost materials: Sam Ortiz").replace("Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction's rules.", "Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction's rules.");
  return builderPage("Pass test canvass 390", "Edit published job", "", `${LIVE_NOTICE}${track(5, 5)}${saveLine("Changes save when you finish.")}${stepHead(5)}${rows}${nextRow(5, { width, msg: "Save changes" })}`, width);
}
async function builderClosed(_, width) {
  return reading(masthead({ context: "Edit published job", title: "Pass test canvass 390", actions: `<a class="btn-ghost" href="/jobs/${JOB}">Job</a>` }), `<div class="empty-state"><p class="empty-state-title">This job can't be edited</p><p class="empty-state-body">A closed job keeps the terms it closed with.</p></div>`);
}
async function builderNoAccess({ pick }) {
  const main = await pick("no-access", "main");
  return main.replace('<div class="tpl-body">', '<div class="no-access-notice" role="status"><p class="alert-info">Your role doesn\'t include the page you opened, so you\'re here instead. An owner can change what your role reaches.</p></div><div class="tpl-body">');
}

/* ---------- publishing on the job page ---------- */

const GROUP = (title, items, after = "") => `<div class="blocker-group"><h3>${title}</h3><ul class="list-disc space-y-0.5 pl-5">${items.map((i) => `<li>${i}</li>`).join("")}</ul>${after}</div>`;
const step = (s) => ` <span class="blocker-step">Step ${s + 1} · ${STEPS[s]}</span>`;
function publishing({ job = [], settings = [], counsel = [], settingsLink = true, canEdit = true }) {
  const groups = [
    job.length ? GROUP("In this job", job.map(([t, s]) => t + step(s))) : "",
    settings.length ? GROUP("In organization settings", settings, settingsLink ? '<a class="link" href="/org/settings">Organization settings</a>' : "") : "",
    counsel.length ? GROUP("With counsel", counsel, '<p class="text-muted-sm">Turfcut staff approve rule profiles.</p>') : "",
  ].join("");
  const blocked = job.length + settings.length + counsel.length > 0;
  return `<section class="section"><h2 class="section-title">Publishing</h2>${blocked ? `<div class="alert-warning space-y-2"><p class="font-medium">This job can't publish yet</p>${groups}</div>` : '<p class="text-muted-sm">Every check passes. Publishing re-runs them at that moment.</p>'}${canEdit ? `<div class="flex flex-wrap items-start gap-3"><button class="btn-primary" ${blocked ? "disabled" : ""}>Publish</button><a class="btn-secondary" href="/jobs/${JOB}/edit">Edit draft</a></div>` : ""}</section>`;
}
const JOB_BLOCKERS = [["Disclose the campaign's type, affiliation and message.", 4], ["Name who handles emergencies, disputes and lost materials.", 3], ["Add at least one staging point, or switch the job to self-launch.", 1]];
const SETTINGS_BLOCKERS = ["Sign the contractor terms in organization settings.", "Complete the worker-classification review in organization settings."];
async function jobHead({ pick }) {
  return pick("job-draft-blocked", "div.tpl-head");
}
const jobBody = (publishingSection) => `<div class="tpl-body"><div class="tpl-main">${publishingSection}<p class="text-muted max-w-prose">Knock doors in Capitol Hill. Functional pass fixture.</p></div></div>`;
async function publishingBlocked(ctx) { return `<main class="tpl" data-template="record" data-org="true">${await jobHead(ctx)}${jobBody(publishing({ job: JOB_BLOCKERS, settings: SETTINGS_BLOCKERS, counsel: ["Boulder, CO (rules v1) hasn't been approved by counsel."] }))}</main>`; }
async function publishingRestricted(ctx) { return `<main class="tpl" data-template="record" data-org="true">${await jobHead(ctx)}${jobBody(publishing({ job: JOB_BLOCKERS, settings: SETTINGS_BLOCKERS, counsel: ["Boulder, CO (rules v1) hasn't been approved by counsel."], settingsLink: false, canEdit: false }))}</main>`; }
async function publishingCounsel(ctx) { return `<main class="tpl" data-template="record" data-org="true">${await jobHead(ctx)}${jobBody(publishing({ counsel: ["Boulder, CO (rules v1) hasn't been approved by counsel."] }))}</main>`; }
async function publishingClear(ctx) { return `<main class="tpl" data-template="record" data-org="true">${(await jobHead(ctx)).replace("Boulder, CO (rules v1)", "Denver, CO (rules v1)")}${jobBody(publishing({}))}</main>`; }
async function publishingFrozen(ctx) {
  const head = (await jobHead(ctx)).replace("Boulder, CO (rules v1)", "Denver, CO (rules v1)").replace('class="status status-draft" data-state="draft"', 'class="status status-approved" data-state="approved"').replace(/Draft<\/span>/, "Published</span>");
  const frozen = `<section class="section"><h2 class="section-title">Frozen</h2><div class="alert-warning space-y-2"><p class="font-medium">No new shifts or seats until this job fits the current rules</p><ul class="list-disc space-y-0.5 pl-5"><li>Denver, CO (rules v1) has been superseded by a newer version; the organization has to file the job under the current rules.</li></ul><a class="link" href="/jobs/${JOB}/edit">Edit the job to file it under the current rules</a></div></section>`;
  return `<main class="tpl" data-template="record" data-org="true">${head}${jobBody(frozen)}</main>`;
}

/* ---------- candidate and worker ---------- */

const CHIP = (what) => `<span class="status status-not-shared" title="The worker hasn't shared their ${what} with you"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off status-glyph" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>Not shared<span class="sr-only">: ${what}</span></span>`;
const row = (k, v, extra = "") => `<div class="share-row${extra ? " open" : ""}"><dt>${k}</dt><dd>${v}</dd>${extra ? `<div class="share-detail">${extra}</div>` : ""}</div>`;
const FIT_FIELDS = ["Identity labels", "Party relationship", "Issue overlap with this campaign", "Campaign interests"];
// political-fit.ts:542-546, :602: NOT_SHARED_BASIS when every field is withheld, SHARED_BASIS as soon as one is shared.
const FIT_BASIS = `<p class="text-hint">Political-fit answers are shared only when a worker chooses to. "Not shared" is the default and says nothing about fit.</p>`;
const SHARED_BASIS = `<p class="text-hint">Worker-authorized signals: shown because this worker chose to share these answers with organizations they apply to, claim a spot with or accept an invitation from, and they have with yours. Issue positions appear only where they agree with a position your campaign disclosed; the worker's full questionnaire is never shared.</p>`;
const fitDetail = (values) => `<dl class="list-card">${FIT_FIELDS.map((f, i) => `<div class="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"><dt class="text-muted">${f}</dt><dd class="text-fg sm:text-right">${values[i]}</dd></div>`).join("")}</dl>${values.some((v) => v !== "Not shared") ? SHARED_BASIS : FIT_BASIS}`;
async function scorecardPanel({ pick }, variant = "shared") {
  // "shared": Jordan's panel (two verified shifts); "empty": Riley's (no verified shifts yet). Both harvested from the app.
  const sec = await pick(variant === "empty" ? "candidate-in-review" : "scorecard-shared", "section.section", { heading: "Scorecard" });
  return sec.replace(/^<section class="section"><h2 class="section-title">Scorecard<\/h2>/, "").replace(/<\/section>$/, "");
}

/** The shared-profile card. `share` names which parts are shared; `fit` is the four fit values (or null). The scorecard summary is composed from the harvested panel's visible tiles only. */
async function shareCard(ctx, { scorecard, availability, credentials, experience, fit, open = "scorecard" }) {
  const rows = [];
  rows.push(scorecard === "empty" ? row("Scorecard", "No verified shifts yet", await scorecardPanel(ctx, "empty")) : scorecard ? row("Scorecard", "2 verified shifts · 100% show rate · 80 doors attempted", open === "scorecard" ? await scorecardPanel(ctx) : "") : row("Scorecard", CHIP("scorecard")));
  rows.push(availability ? row("Availability", "No availability set yet.") : row("Availability", CHIP("availability")));
  rows.push(credentials ? row("Credentials", "No credentials added.") : row("Credentials", CHIP("credentials")));
  rows.push(experience ? row("Experience", "No experience yet") : row("Experience", CHIP("experience")));
    // Field detail only when at least one field is shared (political-fit.ts:602); null and all-withheld are the same neutral row.
  const anyFit = Array.isArray(fit) && fit.some((v) => v !== "Not shared");
  rows.push(anyFit ? row("Political fit", `${fit.filter((v) => v !== "Not shared").length} of 4 fields shared`, fitDetail(fit)) : row("Political fit", "Not shared", FIT_BASIS));
  return `<section class="section"><h2 class="section-title">What they share with you now</h2><dl class="card share-rows">${rows.join("")}</dl><p class="text-hint">Only what the worker shares with your organization, as of now. "Not shared" says nothing about them.</p></section>`;
}
const history = (events) => `<ol class="space-y-1.5 border-l border-border pl-4 text-sm" aria-label="History">${events.map(([t, d, sub]) => `<li class="space-y-0.5"><p class="text-fg">${t} <span class="text-muted">· ${d}</span></p>${sub ? `<p class="text-muted-sm">${sub}</p>` : ""}</li>`).join("")}</ol>`;
const status = (label, state) => `<span class="status status-${state}" data-state="${state}"><svg class="status-glyph" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">${state === "closed" ? '<path d="M5 12h14"/>' : `<circle cx="12" cy="12" r="10"${state === "pending" ? ' stroke-dasharray="4 3"' : ""}/>`}</svg>${label}</span>`;
const ACTIONS = {
  applied: `<div class="flex flex-wrap items-start gap-2"><button class="btn-secondary btn-sm">Send offer</button><button class="btn-secondary btn-sm">Mark in review</button><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Not selected</summary></details></div>`,
  inReview: `<div class="flex flex-wrap items-start gap-2"><button class="btn-secondary btn-sm">Send offer</button><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Not selected</summary></details></div>`,
  offer: `<div class="space-y-2"><p class="text-muted-sm">Offer sent, waiting on the worker (about 40 hours left to accept).</p><div class="flex flex-wrap items-start gap-2"><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Withdraw the offer</summary></details></div></div>`,
  offerExpired: `<div class="space-y-2"><p class="text-muted-sm">The offer lapsed before the worker answered.</p><div class="flex flex-wrap items-start gap-2"><button class="btn-secondary btn-sm">Send a new offer</button><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Close as not selected</summary></details></div></div>`,
  invited: `<div class="space-y-2"><p class="text-muted-sm">Invitation sent; the worker can answer until Nov 12.</p><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Withdraw invitation</summary></details></div>`,
  inviteExpired: `<div class="space-y-2"><p class="text-muted-sm">The invitation expired unanswered. You can invite them again from their page.</p><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Withdraw invitation</summary></details></div>`,
  hired: `<form><button class="btn-secondary btn-sm">Message</button></form>`,
  failed: `<div class="flex flex-wrap items-start gap-2"><button class="btn-secondary btn-sm">Send offer</button><button class="btn-secondary btn-sm">Mark in review</button><details class="group"><summary class="btn-ghost btn-sm cursor-pointer list-none">Not selected</summary></details></div><p role="status" class="text-danger-msg">This worker has closed their account.</p>`,
};
const forThisJob = (free, creds) => `<section class="section"><h2 class="section-title">For this job</h2><dl class="list-card"><div class="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"><dt class="text-muted">Free on the job's dates</dt><dd class="text-fg sm:text-right">${free}</dd></div>${creds ? `<div class="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"><dt class="text-muted">Required credentials</dt><dd class="text-fg sm:text-right">${creds}</dd></div>` : ""}</dl></section>`;
const composerNone = `<section class="section"><h2 class="section-title">Invite to a job</h2><p class="text-muted-sm">No published job of yours is open to invitations for this worker.</p></section>`;
const composer = `<section class="section"><h2 class="section-title">Invite to a job</h2><div class="card space-y-2"><form class="space-y-3"><div class="w-full space-y-3"><label class="block space-y-1.5"><span class="label">Job</span><select name="jobId" class="field" required><option>Pass test canvass 390</option></select></label><label class="block space-y-1.5"><span class="label">Note to the worker (optional)</span><textarea name="note" class="field min-h-20"></textarea><span class="text-hint block">They read this with the invitation. Keep it about the job.</span></label></div><button class="btn-primary">Send invitation</button></form><p class="text-hint">3 of 3 invitations left this week for this worker. It lasts 7 days; you aren't told whether they open it.</p></div></section>`;
const REL = { "Nov 5, 2026": "2 hr ago", "Nov 2, 2026": "3 days ago" }; // relativeTime (src/lib/format.ts:5-15) as of the capture, 3:14 PM on Nov 5: "N hr ago" / "N days ago"
const snapshotFold = (when, date) => `<details class="card"><summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-fg">${when} · ${date}</summary><div class="space-y-3 border-t border-border p-4"><p class="text-muted-sm">Exactly what you could see then. It never changes, even if they share less later.</p><p class="text-hint">As of ${date} (${REL[date]}) · only what the worker shared then</p><dl class="list-card"><div class="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"><dt class="text-muted">Show rate</dt><dd class="text-fg sm:text-right">No data yet</dd></div><div class="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"><dt class="text-muted">Verified work</dt><dd class="text-fg sm:text-right">No verified shifts yet</dd></div></dl>${fitDetail(["Not shared", "Not shared", "Not shared", "Not shared"])}</div></details>`;

async function candidate(ctx, width, { name, since, stage, state, actions, events, share, free = "Not set", notOpen = null, snapshot = "When they applied", context = "Applicant · Pass test canvass 390" }) {
  const head = masthead({ context, title: name, meta: `<span class="candidate-stage">Since ${since} ${status(stage, state)}</span>`, actions: `<a class="btn-ghost btn-sm" href="/hiring/${JOB}/applicants">Applicants</a><a class="btn-secondary btn-sm" href="/jobs/${JOB}">Job page</a>`, below: `<div class="pt-2">${actions}</div>` });
  const hist = `<section class="section"><h2 class="section-title">History</h2>${history(events)}</section>`;
  const body = notOpen
    ? `${hist}<section class="alert-info">${notOpen}</section>${snapshotFold(snapshot, since)}`
    : `${forThisJob(free, share.creds)}${hist}${await shareCard(ctx, share)}${share.composer ? composer : composerNone}${snapshotFold(snapshot, since)}`;
  return record(head, body);
}
const WITHHELD = { scorecard: false, availability: false, credentials: false, experience: false, fit: null };
const SHARED = { scorecard: true, availability: true, credentials: true, experience: true, fit: ["Not shared", "Not shared", "Not shared", "Not shared"] };
// Partial sharing is SYNTHETIC: no fixture holds it. The scorecard is Riley's real empty one (parts/candidate-in-review); the two fit answers are invented to show the shared shape. Declared in the frame state, PLAN §3 and COVERAGE.
const MIXED = { scorecard: "empty", availability: false, credentials: true, experience: false, fit: ["Union member", "Not shared", "Not shared", "Housing, transit"] };
const C = (over) => (ctx, w) => candidate(ctx, w, over);
const candidates = {
  withheld: C({ name: "Casey Nguyen", since: "Nov 5, 2026", stage: "Applied", state: "pending", actions: ACTIONS.applied, events: [["Applied", "Nov 5, 2026"]], share: WITHHELD, free: CHIP("availability") }),
  mixed: C({ name: "Riley Chen", since: "Nov 5, 2026", stage: "In review", state: "pending", actions: ACTIONS.inReview, events: [["Applied", "Nov 5, 2026"], ["In review", "Nov 5, 2026"]], share: MIXED, free: CHIP("availability") }),
  offer: C({ name: "Morgan Diaz", since: "Nov 5, 2026", stage: "Offer", state: "pending", actions: ACTIONS.offer, events: [["Applied", "Nov 5, 2026"], ["Offer sent", "Nov 5, 2026"]], share: SHARED }),
  offerExpired: C({ name: "Alex Rivera", since: "Nov 2, 2026", stage: "Offer expired", state: "closed", actions: ACTIONS.offerExpired, events: [["Applied", "Nov 2, 2026"], ["Offer sent", "Nov 2, 2026"]], share: SHARED }),
  invited: C({ name: "Sam Torres", since: "Nov 5, 2026", stage: "Invited", state: "pending", actions: ACTIONS.invited, events: [["Invited", "Nov 5, 2026", "“We're knocking in Aurora from Nov 5. Your canvass record fits; the shifts are 4 hours, mornings.”"]], share: SHARED, notOpen: "They haven't answered your invitation, so their profile opens only once they do (or if they apply to one of your jobs).", snapshot: "When you invited them" }),
  inviteExpired: C({ name: "Devon Park", since: "Nov 5, 2026", stage: "Invitation expired", state: "closed", actions: ACTIONS.inviteExpired, events: [["Invited", "Nov 5, 2026"]], share: SHARED, notOpen: "They haven't answered your invitation, so their profile opens only once they do (or if they apply to one of your jobs).", snapshot: "When you invited them" }),
  hired: C({ name: "Jordan Blake", since: "Nov 2, 2026", stage: "Active", state: "approved", actions: ACTIONS.hired, events: [["Applied", "Nov 2, 2026"], ["Offer sent", "Nov 2, 2026"], ["Accepted the offer", "Nov 2, 2026"]], share: SHARED }),
  notSelected: C({ name: "Taylor Brooks", since: "Nov 5, 2026", stage: "Not selected", state: "closed", actions: "", events: [["Applied", "Nov 5, 2026"], ["Not selected", "Nov 5, 2026", "Availability doesn't fit the job's dates"]], share: WITHHELD, notOpen: "They have no open application or job with your organization now, so their live profile isn't open to you. The history and the copy below stay." }),
  failed: C({ name: "Casey Nguyen", since: "Nov 5, 2026", stage: "Applied", state: "pending", actions: ACTIONS.failed, events: [["Applied", "Nov 5, 2026"]], share: WITHHELD, free: CHIP("availability") }),
};

async function worker(ctx, width, { name, share, composer: c }) {
  const head = masthead({ title: name, actions: `<a class="btn-ghost" href="/jobs">Jobs</a>` });
  return record(head, `${await shareCard(ctx, share)}${c ? composer : composerNone}`);
}
const workers = {
  shared: (ctx, w) => worker(ctx, w, { name: "Jordan Blake", share: SHARED, composer: false }),
  withheld: (ctx, w) => worker(ctx, w, { name: "Casey Nguyen", share: WITHHELD, composer: false }),
  nameNotShared: (ctx, w) => worker(ctx, w, { name: "Name not shared", share: MIXED, composer: true }),
  denied: () => reading("", `<div class="empty-state"><p class="empty-state-title">This profile isn't available</p><p class="empty-state-body">Your organization is awaiting approval.</p></div>`),
};

/* ---------- applicants ---------- */

async function applicants({ pick }, width, { selected = false, empty = false, filtered = false, inspector = false }) {
  const main = await pick(filtered ? "applicants-empty-filter" : inspector ? "applicants-desktop" : "applicants", "main");
  let m = main.replace(/<table[\s\S]*?<\/table>/, (t) => t.replace(/not shared/g, "Not shared"));
  // The bulk form becomes one line until a row is ticked.
  const bulk = selected
    ? `<form id="applicants-bulk" class="card space-y-3"><p class="text-sm text-muted">1 selected</p><div class="flex flex-wrap items-end gap-3"><label class="space-y-1.5"><span class="label">For the selected applicants</span><select name="bulk" class="field"><option value="review" selected="">Mark in review</option><option value="offer">Send an offer</option><option value="decline">Not selected</option></select></label><button class="btn-secondary">Update selected</button></div></form>`
    : `<form id="applicants-bulk" class="flex items-center gap-2 text-sm text-muted"><span>0 selected</span></form>`;
  m = m.replace(/<form id="applicants-bulk"[\s\S]*?<\/form>/, bulk);
  if (selected) m = m.replace('aria-label="Select Riley Chen" class="size-4"', 'aria-label="Select Riley Chen" class="size-4" checked');
  if (empty) m = m.replace("6 applicants · 2 to decide · 2 offers out · 5 spots", "0 applicants · 0 to decide · 0 offers out · 5 spots").replace(/(applicants">Applicants<span class="tabular-nums"> (?:<!-- -->)?)6/, "$10").replace(/<div data-inspector-source="true">[\s\S]*?<\/div>\s*<p class="text-hint">/, `<div class="empty-state"><p class="empty-state-title">Nobody has applied yet</p><p class="empty-state-body">Workers who apply show up here, with what each one shares with your organization.</p></div><p class="text-hint">`).replace(/<form id="applicants-bulk"[\s\S]*?<\/form>/, "");
  return m;
}

/* ---------- the frame list ---------- */

const NOTES = {
  builder: ["One step track, all six steps, scrolling sideways on a phone with the current step kept in view; the steps keep today's buttons, aria-current and aria-disabled.", "A focusable problem summary under the step heading; each line focuses its field; the inline errors stay.", "Next is full width on a phone; Back under it; the save line keeps today's words (saveWords).", "On a desktop the form is the reading template's 680px column; the optional side note (question 9) is not drawn.", "The steps keep today's styles: .step-current, .step-done for reached steps, plain for the rest."],
  map: ["The staging map is the harvested Leaflet markup with Leaflet's own stylesheet and OpenStreetMap tiles for the column's width; the pin, the radius, the zoom buttons and the attribution are the app's."],
  publishing: ["Blockers grouped by who fixes them, words unchanged. The settings link only for a member who can open it; a restricted editor sees reasons and no actions.", "The step label on each 'In this job' reason needs a reason-to-step mapping (question 3).", "Publish stays disabled while any group has a reason; Edit draft is the destination for the first group."],
  candidate: ["The stage chip beside 'Since', its actions under the title: the next action beside the person.", "'For this job' first, then the history, then one card with one row per shared part.", "A withheld part is the app's own Not shared chip and nothing else; an empty part says its empty words; partial sharing keeps every shared field and switches to the app's shared-basis sentence (political-fit.ts:602).", "The snapshot folds under its date (question 5)."],
  worker: ["The same shared-profile card as the candidate page, the invite composer after it (InviteComposer's own words), the refusals unchanged."],
  applicants: ["Nav: the dock and rail come from the app on the same route (Hiring current here; Jobs or More on the builder; nothing on a worker page, as the app does).", "The bulk form is one line, '0 selected', until a row is ticked.", "'Not shared' in the table, the chip's words (question 6). Tabs stay filter-chip links with aria-current; the inspector stays from 1280."],
};
const AREA = { Builder: "jobs", "Job page": "jobs", Candidate: "hiring", "Worker page": "workers", Applicants: "hiring" };
const F = (name, screen, state, widths, body, notes, parts) => ({ name, screen, state, widths, body, notes, parts, area: AREA[screen] });
export const FRAMES = [
  F("builder-new-errors", "Builder", "new job, step 1, two problems", [390, 1440], builderStep1Errors, NOTES.builder, ["builder-new-errors"]),
  F("builder-new-saved", "Builder", "new job, step 1, draft saved", [390, 1440], builderStep1Saved, NOTES.builder, ["builder-draft-step2"]),
  { ...F("builder-draft-step2", "Builder", "saved draft, step 2 (dates, city, launch, staging map)", [390, 1440], builderStep2, [...NOTES.builder, ...NOTES.map], ["builder-draft-step2"]), scrollTo: ".turf-map" },
  F("builder-draft-step4-errors", "Builder", "saved draft, step 4, contacts missing", [390, 1440], builderStep4, NOTES.builder, ["builder-draft-step4"]),
  F("builder-draft-step5", "Builder", "saved draft, step 5 (campaign disclosure)", [390, 1440], builderStep5, NOTES.builder, ["builder-draft-step5"]),
  F("builder-saving", "Builder", "saved draft, step 3, saving", [390, 1440], builderSaving, NOTES.builder, ["builder-draft-step2"]),
  F("builder-failed-save", "Builder", "saved draft, step 3, couldn't save", [390, 1440], builderFailedSave, NOTES.builder, ["builder-draft-step2"]),
  F("builder-review", "Builder", "saved draft, step 6 review", [390, 1440], builderReview, NOTES.builder, []),
  F("builder-live-step1", "Builder", "published job, step 1", [390, 1440], builderLive, NOTES.builder, ["builder-live"]),
  F("builder-live-review", "Builder", "published job, review, Save changes", [390, 1440], builderLiveReview, NOTES.builder, []),
  F("builder-closed", "Builder", "closed job refusal", [390, 1440], builderClosed, [], []),
  F("builder-no-access", "Builder", "member without jobsEdit", [390, 1440], builderNoAccess, [], ["no-access"]),
  F("publishing-blocked", "Job page", "draft, blocked in job, settings and counsel (composite: the Aurora draft's head with every group's reasons; no fixture is blocked in all three)", [390, 1440], publishingBlocked, NOTES.publishing, ["job-draft-blocked"]),
  F("publishing-restricted", "Job page", "draft, blocked, viewer without settings or edit access (same composite)", [390, 1440], publishingRestricted, NOTES.publishing, ["job-draft-blocked"]),
  F("publishing-counsel", "Job page", "draft, blocked by the jurisdiction only", [390, 1440], publishingCounsel, NOTES.publishing, ["job-draft-blocked"]),
  F("publishing-clear", "Job page", "draft, every check passes", [390, 1440], publishingClear, NOTES.publishing, ["job-draft-blocked"]),
  F("publishing-frozen", "Job page", "published job frozen under newer rules", [390, 1440], publishingFrozen, NOTES.publishing, ["job-draft-blocked"]),
  F("candidate-withheld", "Candidate", "applied, nothing shared", [390, 1440], candidates.withheld, NOTES.candidate, ["scorecard-shared"]),
  F("candidate-mixed", "Candidate", "in review, partial sharing (synthetic: Riley's empty scorecard, invented fit answers)", [390, 1440], candidates.mixed, NOTES.candidate, ["scorecard-shared"]),
  F("candidate-offer", "Candidate", "offer out (composite: Jordan's shared scorecard under Morgan's name; Morgan's own sharing isn't fixtured)", [390, 1440], candidates.offer, NOTES.candidate, ["scorecard-shared"]),
  F("candidate-offer-expired", "Candidate", "offer expired (composite: Jordan's shared scorecard under Alex's name; dated by fixture, not captured)", [390, 1440], candidates.offerExpired, NOTES.candidate, ["scorecard-shared"]),
  F("candidate-invited", "Candidate", "invited, unanswered (profile not open)", [390, 1440], candidates.invited, NOTES.candidate, []),
  F("candidate-invite-expired", "Candidate", "invitation expired", [390, 1440], candidates.inviteExpired, NOTES.candidate, []),
  F("candidate-hired", "Candidate", "hired (Message)", [390, 1440], candidates.hired, NOTES.candidate, ["scorecard-shared"]),
  F("candidate-not-selected", "Candidate", "not selected (profile no longer open)", [390, 1440], candidates.notSelected, NOTES.candidate, []),
  F("candidate-action-failed", "Candidate", "an action failed", [390, 1440], candidates.failed, NOTES.candidate, ["scorecard-shared"]),
  F("worker-shared", "Worker page", "shares with this organization", [390, 1440], workers.shared, NOTES.worker, ["scorecard-shared"]),
  F("worker-withheld", "Worker page", "shares nothing; no job open to invitations (they applied to the only published job)", [390, 1440], workers.withheld, NOTES.worker, []),
  F("worker-name-not-shared", "Worker page", "name not shared, partial sharing (synthetic fit answers)", [390, 1440], workers.nameNotShared, NOTES.worker, ["scorecard-shared"]),
  F("worker-denied", "Worker page", "organization awaiting approval", [390, 1440], workers.denied, [], []),
  F("applicants", "Applicants", "six applicants, none selected", [390, 1440], (c, w) => applicants(c, w, {}), NOTES.applicants, ["applicants"]),
  F("applicants-selected", "Applicants", "one selected, bulk form open", [390, 1440], (c, w) => applicants(c, w, { selected: true }), NOTES.applicants, ["applicants"]),
  F("applicants-empty", "Applicants", "nobody applied (every count from the empty state: 0 applicants, Applicants 0)", [390, 1440], (c, w) => applicants(c, w, { empty: true }), NOTES.applicants, ["applicants"]),
  F("applicants-filtered-empty", "Applicants", "filters match nobody", [390, 1440], (c, w) => applicants(c, w, { filtered: true }), NOTES.applicants, ["applicants-empty-filter"]),
  F("applicants-inspector", "Applicants", "inspector open (1440)", [1440], (c, w) => applicants(c, w, { inspector: true }), NOTES.applicants, ["applicants-desktop"]),
].map((f) => ({ ...f, body: async (ctx, w) => ctx.orgShell(await f.body(ctx, w), f.area) }));
