/**
 * Haptic feedback for taps, where the browser offers the Vibration API
 * (most Android phones). iPhone Safari has none and plays its system tick
 * only when a finger toggles a real switch, so on iPhone the app's own
 * toggles are native switches (`<input switch>`) and buttons stay silent;
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

/** A short tap tick. Call from a user gesture (click/pointer handlers). */
export function haptic(): void {
  if (typeof window === "undefined" || !hapticsEnabled() || !canVibrate()) return;
  navigator.vibrate(8);
}

/** What counts as a "button" for feedback: real controls, not plain text links. */
export const HAPTIC_TARGETS =
  'button:not(:disabled), [role="button"], a.btn, a.btn-primary, a.btn-secondary, a.btn-ghost, a.tab, a.topnav-link, label.chip, label.option-card, label.toggle, summary, .quick-reply';
