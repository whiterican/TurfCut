"use client";

import { useEffect } from "react";
import { motionReduced } from "@/lib/motion";
import { TILT_TARGETS, tiltFor } from "@/lib/press-tilt";

/**
 * One listener for the whole app: while a floating card is pressed, it dips toward the finger
 * (lib/press-tilt). The angles go on the card as --tilt-x / --tilt-y and globals.css turns it;
 * letting go, scrolling away or leaving the card sets it level again. A press still does
 * whatever it did before: nothing here stops or handles the tap itself.
 */
export function PressTilt() {
  useEffect(() => {
    let card: HTMLElement | null = null;
    let pointer = -1;
    // The outermost floating box under the finger: a tile inside a card dips with its card.
    const boxAt = (target: EventTarget | null): HTMLElement | null => {
      let found: HTMLElement | null = null;
      for (let el = target instanceof Element ? target.closest<HTMLElement>(TILT_TARGETS) : null; el; el = el.parentElement?.closest<HTMLElement>(TILT_TARGETS) ?? null) found = el;
      return found;
    };
    const lean = (e: PointerEvent) => {
      if (!card) return;
      const { rx, ry } = tiltFor(card.getBoundingClientRect(), e.clientX, e.clientY);
      card.style.setProperty("--tilt-x", `${rx}deg`);
      card.style.setProperty("--tilt-y", `${ry}deg`);
    };
    const level = () => {
      // The attribute stays (as "off") so the card eases back; the angles go.
      card?.setAttribute("data-tilt", "off");
      card?.style.removeProperty("--tilt-x");
      card?.style.removeProperty("--tilt-y");
      card = null;
      pointer = -1;
    };
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0) || motionReduced()) return;
      if (card) level();
      card = boxAt(e.target);
      if (!card) return;
      pointer = e.pointerId;
      // Measured level, before it turns: a turned box reports a different rectangle.
      lean(e);
      card.setAttribute("data-tilt", "on");
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === pointer) lean(e);
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === pointer) level();
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onEnd, { passive: true });
    document.addEventListener("pointercancel", onEnd, { passive: true });
    window.addEventListener("blur", level);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", level);
      level();
    };
  }, []);
  return null;
}
