"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { candidates as loadCandidates, createTeamChat } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";
import type { ClientCandidate } from "@/components/chat/Members";

const initial: ActionState = { ok: false, message: "" };

export function NewTeamChatForm({ jobs }: { jobs: { id: string; title: string; hired: number; status: string }[] }) {
  const [state, action, pending] = useActionState(createTeamChat, initial);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [people, setPeople] = useState<ClientCandidate[] | null>(null);
  const [loading, start] = useTransition();
  const [loadError, setLoadError] = useState(false);
  // Every field is controlled: React resets uncontrolled ones after each
  // action, so a failed create would otherwise wipe the form.
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const request = useRef(0);

  function toggleJob(id: string, on: boolean) {
    const next = on ? [...jobIds, id] : jobIds.filter((j) => j !== id);
    setJobIds(next);
    setLoadError(false);
    const mine = ++request.current;
    if (next.length === 0) return setPeople(null);
    start(async () => {
      try {
        const list = await loadCandidates(next);
        if (mine !== request.current) return; // a newer selection already loaded
        setPeople(list);
        // Workers start ticked; keep any choices still eligible.
        setChosen((prev) => new Set(list.filter((p) => prev.has(p.profileId) || p.role === "WORKER").map((p) => p.profileId)));
      } catch {
        if (mine === request.current) setLoadError(true);
      }
    });
  }

  const managers = people?.filter((p) => p.role === "MANAGER") ?? [];
  const workers = people?.filter((p) => p.role === "WORKER") ?? [];
  const pick = (p: ClientCandidate) => (
    <label key={p.profileId} className="chip">
      <input
        type="checkbox"
        name="memberIds"
        value={p.profileId}
        className="sr-only"
        checked={chosen.has(p.profileId)}
        onChange={(e) => setChosen((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.profileId); else n.delete(p.profileId); return n; })}
      />
      {p.name}
      <span className="text-xs text-subtle">{p.detail}</span>
    </label>
  );

  return (
    <form action={action} className="space-y-6">
      <div className="space-y-2">
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" className="field" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Denver housing initiative — Team A" />
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Jobs</legend>
        <p className="text-hint">Workers can post while they&apos;re hired on one of these. When their hire ends, they&apos;re removed automatically.</p>
        <div className="flex flex-wrap gap-2">
          {jobs.map((j) => (
            <label key={j.id} className="chip">
              <input type="checkbox" name="jobIds" value={j.id} className="sr-only" checked={jobIds.includes(j.id)} onChange={(e) => toggleJob(j.id, e.target.checked)} />
              {j.title}
              <span className="text-xs text-subtle">{j.hired} hired</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3" aria-busy={loading}>
        <legend className="label">Members</legend>
        {jobIds.length === 0 ? (
          <p className="text-hint">Pick at least one job to see who can join.</p>
        ) : loading && !people ? (
          <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-28 rounded-full" />)}</div>
        ) : loadError ? (
          <p role="alert" className="text-danger-msg">Couldn&apos;t load people. Untick and re-tick a job to try again.</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="fieldset-title">Managers</p>
              <p className="text-hint">You&apos;re added as a manager automatically. Managers&apos; messages carry a &ldquo;Manager&rdquo; badge.</p>
              <div className="flex flex-wrap gap-2">{managers.map(pick)}</div>
            </div>
            <div className="space-y-2">
              <p className="fieldset-title">Workers hired on these jobs</p>
              {workers.length === 0 ? <p className="text-hint">No one is hired on these jobs yet. You can add workers later.</p> : <div className="flex flex-wrap gap-2">{workers.map(pick)}</div>}
            </div>
          </>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || jobIds.length === 0}>{pending ? "Creating…" : "Create team chat"}</button>
        {state.message && !state.ok && <p role="alert" className="text-danger-msg">{state.message}</p>}
      </div>
    </form>
  );
}
