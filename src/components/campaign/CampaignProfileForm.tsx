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
        <label className="space-y-1.5">
          <span className="label">Campaign name</span>
          <input name="displayName" className="field" required maxLength={NAME_MAX} defaultValue={defaults?.displayName} placeholder="Yes on 7" {...describe("displayName")} />
          {err("displayName")}
        </label>
        <label className="space-y-1.5">
          <span className="label">Handle</span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="text-muted">@</span>
            <input
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
              aria-describedby={["hint-handle", errors.handle ? "err-handle" : ""].filter(Boolean).join(" ")}
              aria-invalid={errors.handle ? true : undefined}
            />
          </span>
          <p id="hint-handle" className="text-hint">
            {handleLocked ? "Your public address. Unpublish to change it." : "Your public address: turfcut.app/c/handle. 3 to 30 lowercase letters, numbers or underscores."}
          </p>
          {err("handle")}
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="label">Bio</span>
        <textarea
          name="bio"
          className="field min-h-40"
          maxLength={BIO_MAX + 200}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-describedby={["hint-bio", errors.bio ? "err-bio" : ""].filter(Boolean).join(" ")}
          aria-invalid={errors.bio ? true : undefined}
        />
        <p id="hint-bio" className="text-hint">
          Who you are and what you&apos;re working for, in your words. Turfcut shows it exactly as written; web links become clickable. {charCount(bio).toLocaleString("en-US")} / {BIO_MAX.toLocaleString("en-US")}
        </p>
        {err("bio")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save profile" : "Create campaign"}</button>
        {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
      </div>
    </form>
  );
}
