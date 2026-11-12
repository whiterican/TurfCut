"use client";

import { useActionState, useState } from "react";
import { createChannel } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";
import { CHANNEL_NAME_MAX, CHANNEL_TOPIC_MAX, validateChannelName } from "@/lib/chat";

const initial: ActionState = { ok: false, message: "" };

/** New channel: a name, an optional topic, and who it is for (staff only, or staff plus workers hired on the jobs picked). */
export function NewChannelForm({ jobs }: { jobs: { id: string; title: string; hired: number }[] }) {
  const [state, action, pending] = useActionState(createChannel, initial);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<"staff" | "team">("staff");
  const clean = validateChannelName(name);
  return (
    <form action={action} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="label">Name</span>
        <input name="name" className="field" required maxLength={CHANNEL_NAME_MAX * 2} value={name} onChange={(e) => setName(e.target.value)} placeholder="denver-sales" autoComplete="off" />
        <span className="text-hint block" aria-live="polite">{name.trim() ? (clean.ok ? `Shown as #${clean.name}` : clean.reason) : "Lower case, with hyphens for spaces."}</span>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Topic <span className="font-normal text-subtle">(optional)</span></span>
        <input name="topic" className="field" maxLength={CHANNEL_TOPIC_MAX} placeholder="What this channel is for" autoComplete="off" />
      </label>
      <fieldset className="space-y-2">
        <legend className="label">Who it&apos;s for</legend>
        <label className="choice-row">
          <input type="radio" name="audience" value="staff" checked={audience === "staff"} onChange={() => setAudience("staff")} />
          <span>
            <span className="block font-semibold text-fg">Staff only</span>
            <span className="text-hint block">Anyone on your staff can join. Workers never see it.</span>
          </span>
        </label>
        <label className="choice-row">
          <input type="radio" name="audience" value="team" checked={audience === "team"} onChange={() => setAudience("team")} disabled={jobs.length === 0} />
          <span>
            <span className="block font-semibold text-fg">Staff and hired workers</span>
            <span className="text-hint block">{jobs.length === 0 ? "Publish a job first: workers are added from the jobs they are hired on." : "Tied to jobs. You add workers hired on them; workers can't join by themselves."}</span>
          </span>
        </label>
      </fieldset>
      {audience === "team" && (
        <fieldset className="space-y-2">
          <legend className="label">Jobs</legend>
          <div className="flex flex-wrap gap-2">
            {jobs.map((j) => (
              <label key={j.id} className="chip">
                <input type="checkbox" name="jobIds" value={j.id} className="sr-only" />
                {j.title}
                <span className="text-xs text-subtle">{j.hired} hired</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create channel"}</button>
      {state.message && <p role="alert" className="text-danger-msg">{state.message}</p>}
    </form>
  );
}
