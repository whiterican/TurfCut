"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { duration } from "@/lib/motion";
import { sheetRelease } from "@/lib/sheet";

/**
 * A bottom sheet (P1.6): a native modal <dialog> that springs up from the
 * bottom edge (centred on wide screens), with a handle to drag it down and
 * away. The browser traps focus, makes the page inert, closes on Escape and
 * hands focus back to the trigger. Under "Less motion" it simply appears.
 */
export function Sheet({
  label,
  trigger,
  triggerClassName = "btn-secondary",
  children,
  closeOnSubmit = true,
}: {
  /** The sheet's name for assistive tech and its heading. */
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  children: React.ReactNode;
  /** A form inside that navigates (filters) closes the sheet as it submits. */
  closeOnSubmit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t0: number; y: number; t: number } | null>(null);
  /** A slide-away is playing: a second Escape or tap meanwhile must not restart it from the top. */
  const closing = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open) {
      if (d.open) d.close();
      // The slide-away (filled forwards) and any drag offset would outrank the next entrance: clear them once closed.
      const p = panel.current;
      if (p) {
        for (const a of p.getAnimations()) a.cancel();
        p.style.translate = "";
      }
      closing.current = false;
    }
  }, [open]);

  /** Slides the panel down, then closes; a cancelled drag springs it back. */
  function dismiss() {
    if (closing.current) return;
    const p = panel.current;
    const ms = duration("base");
    if (!p || !ms) return setOpen(false);
    closing.current = true;
    const from = p.style.translate || "0 0";
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-in").trim() || undefined;
    p.animate([{ translate: from }, { translate: "0 110%" }], { duration: ms, easing, fill: "forwards" }).finished.then(() => setOpen(false), () => setOpen(false));
  }
  function settle() {
    const p = panel.current;
    if (!p) return;
    const from = p.style.translate || "0 0";
    p.style.translate = "";
    const ms = duration("slow");
    if (!ms || from === "0 0") return;
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim() || undefined;
    p.animate([{ translate: from }, { translate: "0 0" }], { duration: ms, easing });
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A press on the Close button is a click, not a drag: capturing it would hand the click to the grip.
    if (closing.current || e.button !== 0 || (e.target as Element).closest("button")) return;
    drag.current = { y0: e.clientY, t0: e.timeStamp, y: e.clientY, t: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const p = panel.current;
    if (!d || !p) return;
    d.y = e.clientY;
    d.t = e.timeStamp;
    // Only downward: the sheet never lifts above where it sits.
    p.style.translate = `0 ${Math.max(0, d.y - d.y0)}px`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const p = panel.current;
    drag.current = null;
    if (!d || !p) return;
    const dy = d.y - d.y0;
    const vy = d.t > d.t0 ? dy / (d.t - d.t0) : 0;
    if (sheetRelease(dy, vy, p.offsetHeight) === "dismiss") dismiss();
    else settle();
  };
  const onPointerCancel = () => {
    drag.current = null;
    settle();
  };

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}>
        {trigger}
      </button>
      <dialog
        ref={dialog}
        id={id}
        aria-label={label}
        className="sheet"
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          // Escape slides the sheet away like the button does (the browser honours this because Escape is a user action).
          e.preventDefault();
          dismiss();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dismiss();
        }}
        onSubmit={() => {
          if (closeOnSubmit) setOpen(false);
        }}
      >
        <div ref={panel} className="sheet-panel" data-open={open || undefined}>
          <div className="sheet-grip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
            <span className="sheet-handle" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">{label}</p>
              <button type="button" className="btn-ghost btn-sm" onClick={dismiss} aria-label="Close">
                <X aria-hidden className="btn-icon" />
              </button>
            </div>
          </div>
          <div className="sheet-body">{children}</div>
        </div>
      </dialog>
    </>
  );
}
