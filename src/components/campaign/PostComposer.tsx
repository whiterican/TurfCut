"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { PostFormState } from "@/app/campaigns/actions";
import { charCount, POST_MAX } from "@/lib/campaign-social";

const initial: PostFormState = { ok: false, message: "" };

/** Writes (or edits) a post: up to 500 characters, optionally embedding one of the organization's published jobs. */
export function PostComposer({
  action,
  campaignId,
  postId,
  jobs,
  defaults,
  submitLabel = "Post",
}: {
  action: (prev: PostFormState, fd: FormData) => Promise<PostFormState>;
  campaignId: string;
  postId?: string;
  jobs: { id: string; title: string }[];
  defaults?: { body: string; jobId: string | null; jobTitle?: string | null };
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [body, setBody] = useState(defaults?.body ?? "");
  const [jobId, setJobId] = useState(defaults?.jobId ?? "");
  const n = charCount(body.trim());
  const over = n > POST_MAX;
  const id = postId ?? `new-${campaignId}`;
  const answered = useRef(state);
  // A new post clears the box once it's saved (an edit keeps its text).
  useEffect(() => {
    if (state !== answered.current && state.ok && !postId) {
      startTransition(() => {
        setBody("");
        setJobId("");
      });
    }
    answered.current = state;
  }, [state, postId]);
  const err = state.errors ?? {};
  // A post embedding a job that has since closed keeps it until the author picks another.
  const keptJob = defaults?.jobId && !jobs.some((j) => j.id === defaults.jobId) ? { id: defaults.jobId, title: `${defaults.jobTitle ?? "A job"} (no longer published)` } : null;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      {postId && <input type="hidden" name="postId" value={postId} />}
      <div className="space-y-1.5">
        <label htmlFor={`body-${id}`} className="label">{postId ? "Edit post" : "New post"}</label>
        <textarea
          id={`body-${id}`}
          name="body"
          className="field min-h-28"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Talking points, a hiring call, a shift that needs people, a win from the field…"
          aria-describedby={`count-${id}${err.body ? ` err-body-${id}` : ""}`}
          aria-invalid={over || err.body ? true : undefined}
        />
        <p id={`count-${id}`} className={`text-hint text-right tabular-nums ${over ? "text-danger-msg" : ""}`}>
          {n} / {POST_MAX} characters
        </p>
        {err.body && <p id={`err-body-${id}`} className="field-error">{err.body}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`job-${id}`} className="label">Embed a job (optional)</label>
        <select
          id={`job-${id}`}
          name="jobId"
          className="field"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          aria-describedby={[`job-hint-${id}`, err.jobId ? `err-job-${id}` : ""].filter(Boolean).join(" ")}
          aria-invalid={err.jobId ? true : undefined}
        >
          <option value="">No job</option>
          {keptJob && <option value={keptJob.id}>{keptJob.title}</option>}
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <p id={`job-hint-${id}`} className="text-hint">Readers see the job as it is when they read the post, with an Apply button while it&apos;s open.</p>
        {err.jobId && <p id={`err-job-${id}`} className="field-error">{err.jobId}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      </div>
    </form>
  );
}
