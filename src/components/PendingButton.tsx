"use client";

import { useFormStatus } from "react-dom";
import { ButtonFaces, PendingAnnouncement, useButtonPhase } from "@/components/ButtonFaces";

/**
 * A form's submit button that can't be pressed twice: disabled, with a
 * spinner and its pending label, while the form's action runs. Pass the
 * action's latest `result` and it shows a check when that result is ok.
 */
export function PendingButton({
  children,
  pendingLabel,
  doneLabel,
  result,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  doneLabel?: string;
  result?: { ok: boolean } | null;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const phase = useButtonPhase(pending, result);
  return (
    <>
      <button className={className} disabled={pending} aria-busy={pending || undefined}>
        <ButtonFaces phase={phase} label={children} pendingLabel={pendingLabel} doneLabel={doneLabel} />
      </button>
      <PendingAnnouncement pending={pending} text={pendingLabel} />
    </>
  );
}
