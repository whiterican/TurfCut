"use client";

import { useState, useTransition } from "react";

/**
 * A one-time note with "Not now". Tapping it hides the note at once; if the
 * phone is offline the server action fails quietly and the note comes back
 * next time, instead of the failure replacing Today with the error screen.
 */
export function DismissibleNote({
  action,
  title,
  children,
}: {
  action: () => Promise<void>;
  title: string;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <section className="card space-y-3" aria-label={title}>
      <p className="font-semibold text-fg">{title}</p>
      {children}
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => {
          setHidden(true);
          start(async () => {
            try {
              await action();
            } catch {
              // Offline or a dropped connection: it shows again next time.
            }
          });
        }}
      >
        Not now
      </button>
    </section>
  );
}
