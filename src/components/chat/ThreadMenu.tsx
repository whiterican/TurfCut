"use client";

import { useEffect, useRef } from "react";
import { More } from "@/components/chat/icons";

/** The ··· button at the top right of a conversation; its panel holds members and block. */
export function ThreadMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) {
        d.open = false;
        if (e instanceof KeyboardEvent) d.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="icon-btn cursor-pointer list-none" aria-label={label}>
        <More />
      </summary>
      <div className="card card-plain absolute top-[calc(100%+0.5rem)] right-0 z-40 max-h-[calc(100dvh-14rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0">
        {children}
      </div>
    </details>
  );
}
