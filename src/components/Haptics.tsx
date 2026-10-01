"use client";

import { useEffect } from "react";
import { HAPTIC_TARGETS, haptic } from "@/lib/haptics";

/** One listener for the whole app: a light tick when a button or tab is tapped. */
export function Haptics() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Only real taps (not the synthetic click we send ourselves on iOS).
      if (!e.isTrusted || e.button !== 0) return;
      const target = e.target instanceof Element ? e.target.closest(HAPTIC_TARGETS) : null;
      if (target && !target.closest('[aria-hidden="true"]')) haptic();
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
