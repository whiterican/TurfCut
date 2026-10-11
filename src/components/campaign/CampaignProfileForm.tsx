"use client";

import { startTransition, useActionState, useState } from "react";
import type { ProfileFormState } from "@/app/campaigns/actions";
import { BIO_MAX, charCount, NAME_MAX } from "@/lib/campaign-social";

const initial: ProfileFormState = { ok: false, message: "" };

/** The campaign's profile: handle, name and bio, in the campaign's own words. */
export function CampaignProfileForm({
  action,
  id,
  defaults,
  handleLocked,
}: {
  action: (prev: ProfileFormState, fd: FormData) => Promise<ProfileFormState>;
  id?: string;
  defaults?: { handle: string; displayName: string; bio: string };
  /** Public campaigns keep their handle (links to it would break). */
  handleLocked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [bio, setBio] = useState(defaults?.bio ?? "");
  const errors = state.errors ?? {};
  const f = `cp-${id ?? "new"}`;
  const over = charCount(bio) > BIO_MAX;
  const describe = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {});
  const err = (k: string) => (errors[k] ? <p id={`err-${k}`} className="field-error">{errors[k]}</p> : null);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        // Submitted in a transition so a refused save keeps what was typed (React 19 resets an action form).
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${f}-name`} className="label">Campaign name</label>
          <input id={`${f}-name`} name="displayName" className="field" required maxLength={NAME_MAX} defaultValue={defaults?.displayName} placeholder="Yes on 7" {...describe("displayName")} />
          {err("displayName")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${f}-handle`} className="label">Handle</label>
          <div className="flex items-center gap-1">
            <span aria-hidden className="text-muted">@</span>
            <input
              id={`${f}-handle`}
              name="handle"
              className="field"
              required
              maxLength={31}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={defaults?.handle}
              readOnly={handleLocked}
              placeholder="yes_on_7"
              aria-describedby={[`${f}-hint-handle`, errors.handle ? "err-handle" : ""].filter(Boolean).join(" ")}
              aria-invalid={errors.handle ? true : undefined}
            />
          </div>
          <p id={`${f}-hint-handle`} className="text-hint">
            {handleLocked ? "Your public address, for good: links and printed codes point at it." : "Your public address: /c/handle. 3 to 30 lowercase letters, numbers or underscores. It can't change once the campaign has been public."}
          </p>
          {err("handle")}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${f}-bio`} className="label">Bio</label>
        <textarea
          id={`${f}-bio`}
          name="bio"
          className="field min-h-40"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-describedby={[`${f}-hint-bio`, errors.bio ? "err-bio" : ""].filter(Boolean).join(" ")}
          aria-invalid={errors.bio || over ? true : undefined}
        />
        <p id={`${f}-hint-bio`} className="text-hint">
          Who you are and what you&apos;re working for, in your words. Turfcut shows it exactly as written; web links become clickable.{" "}
          <span className={over ? "text-danger-msg" : ""}>{charCount(bio).toLocaleString("en-US")} / {BIO_MAX.toLocaleString("en-US")}</span>
        </p>
        {err("bio")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save profile" : "Create campaign"}</button>
        <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>
      </div>
    </form>
  );
}
