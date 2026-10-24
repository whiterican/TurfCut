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

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  /** Slides the panel down, then closes; a cancelled drag springs it back. */
  function dismiss() {
    const p = panel.current;
    const ms = duration("base");
    if (!p || !ms) return setOpen(false);
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
    if (e.button !== 0) return;
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
        onClick={(e) => {
          if (e.target === e.currentTarget) dismiss();
        }}
        onSubmit={() => {
          if (closeOnSubmit) setOpen(false);
        }}
      >
        <div ref={panel} className="sheet-panel" data-open={open || undefined}>
          <div className="sheet-grip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
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
