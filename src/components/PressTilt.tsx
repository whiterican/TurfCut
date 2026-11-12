"use client";

import { useEffect } from "react";
import { DURATION, motionReduced } from "@/lib/motion";
import { NO_TILT, TILT_TARGETS, tiltFor, type Box } from "@/lib/press-tilt";

/**
 * One listener for the whole app: while a floating card is pressed, it dips toward the finger
 * (lib/press-tilt). The angles go on the card as --tilt-x / --tilt-y and globals.css turns it;
 * letting go sets it level again, and so does anything that ends the press without a release
 * (a touch that becomes a scroll, a menu or picker opening, a drag starting, the window losing
 * focus). A finger that slides off the card counts as its edge until it lifts. A press still
 * does whatever it did before: nothing here stops or handles the tap itself.
 */
export function PressTilt() {
  useEffect(() => {
    let card: HTMLElement | null = null;
    let box: Box | null = null;
    let pointer = -1;
    // The outermost floating box under the finger: a tile inside a card dips with its card.
    const boxAt = (target: EventTarget | null): HTMLElement | null => {
      let found: HTMLElement | null = null;
      for (let el = target instanceof Element ? target.closest<HTMLElement>(TILT_TARGETS) : null; el; el = el.parentElement?.closest<HTMLElement>(TILT_TARGETS) ?? null) found = el;
      return found;
    };
    const lean = (e: PointerEvent) => {
      if (!card || !box) return;
      const { rx, ry, lx, ly } = tiltFor(box, e.clientX, e.clientY);
      card.style.setProperty("--tilt-x", `${rx}deg`);
      card.style.setProperty("--tilt-y", `${ry}deg`);
      card.style.setProperty("--tilt-lx", String(lx));
      card.style.setProperty("--tilt-ly", String(ly));
    };
    const level = () => {
      const was = card;
      card = null;
      box = null;
      pointer = -1;
      if (!was) return;
      // "off" while the card eases back, then the mark goes, so a card that was pressed once is like any other again.
      was.setAttribute("data-tilt", "off");
      for (const v of ["--tilt-x", "--tilt-y", "--tilt-lx", "--tilt-ly"]) was.style.removeProperty(v);
      setTimeout(() => {
        if (was.getAttribute("data-tilt") === "off") was.removeAttribute("data-tilt");
      }, DURATION.slow + 60);
    };
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0) || motionReduced()) return;
      if (card) level();
      // Things that take a drag or open a picker keep their card still.
      if (e.target instanceof Element && e.target.closest(NO_TILT)) return;
      card = boxAt(e.target);
      if (!card) return;
      pointer = e.pointerId;
      // Measured once, level, before it turns: a turned box reports a different rectangle.
      box = card.getBoundingClientRect();
      lean(e);
      card.setAttribute("data-tilt", "on");
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      // A mouse whose button came up somewhere that never told us (a picker, a menu): the press is over.
      if (e.pointerType === "mouse" && e.buttons === 0) return level();
      lean(e);
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === pointer) level();
    };
    // Capturing, so nothing below can keep an event from reaching these.
    const opts = { passive: true, capture: true } as const;
    document.addEventListener("pointerdown", onDown, opts);
    document.addEventListener("pointermove", onMove, opts);
    document.addEventListener("pointerup", onEnd, opts);
    document.addEventListener("pointercancel", onEnd, opts);
    document.addEventListener("contextmenu", level, opts);
    document.addEventListener("dragstart", level, opts);
    window.addEventListener("blur", level);
    return () => {
      document.removeEventListener("pointerdown", onDown, opts);
      document.removeEventListener("pointermove", onMove, opts);
      document.removeEventListener("pointerup", onEnd, opts);
      document.removeEventListener("pointercancel", onEnd, opts);
      document.removeEventListener("contextmenu", level, opts);
      document.removeEventListener("dragstart", level, opts);
      window.removeEventListener("blur", level);
      level();
    };
  }, []);
  return null;
}
