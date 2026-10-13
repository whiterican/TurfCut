"use client";

import { useFormStatus } from "react-dom";

/** A form's submit button that can't be pressed twice: disabled, and says so, while the form's action runs. */
export function PendingButton({ children, pendingLabel, className = "btn-primary" }: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
