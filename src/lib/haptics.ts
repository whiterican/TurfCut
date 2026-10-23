/**
 * Haptic feedback for taps, where the browser offers the Vibration API
 * (most Android phones). iPhone Safari has none and plays its system tick
 * only when a finger toggles a real switch, so on/off switches such as the
 * job filters are native switches (`<input switch>`) and buttons stay silent;
 * a hidden switch clicked from script ticked on older iOS but no longer does.
 * Desktop: no-op. On by default; Display settings can turn it off (saved on
 * this device).
 */
export const HAPTICS_KEY = "turfcut-haptics";

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** True when this browser can vibrate on a tap. */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * The haptic vocabulary (P1.1): a tap is a tick; success is a tick, a beat,
 * and a firmer tick (the check-in landed, the pay arrived); a warning is two
 * longer pulses (something needs a look). Each is a pattern of on/off
 * milliseconds for the Vibration API; nothing here is ever decorative.
 */
export type HapticKind = "tap" | "success" | "warning";
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [12, 40, 24],
  warning: [30, 50, 30],
};

/** A haptic, from a user gesture (click/pointer handlers) or at the moment something lands. */
export function haptic(kind: HapticKind = "tap"): void {
  if (typeof window === "undefined" || !hapticsEnabled() || !canVibrate()) return;
  navigator.vibrate(HAPTIC_PATTERNS[kind]);
}

/** What counts as a "button" for feedback: real controls, not plain text links. */
export const HAPTIC_TARGETS =
  'button:not(:disabled), [role="button"], a.btn, a.btn-primary, a.btn-secondary, a.btn-ghost, a.tab, a.topnav-link, label.chip, label.option-card, label.toggle, summary, .quick-reply';
