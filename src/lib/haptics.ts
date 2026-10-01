/**
 * Haptic feedback for taps. Android browsers expose the Vibration API; iOS
 * Safari (17.4+) has none, but toggling a native `<input switch>` plays the
 * system's light "tick" — so on iPhone we click a hidden one. Desktop: no-op.
 * On by default; Display settings can turn it off (saved on this device).
 */
export const HAPTICS_KEY = "turfcut-haptics";

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "off";
  } catch {
    return true;
  }
}

let iosSwitch: HTMLLabelElement | null = null;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  // Clicking the label toggles the switch (the tick) — keep focus where it was.
  const active = document.activeElement as HTMLElement | null;
  iosSwitch.click();
  if (active && document.activeElement !== active) active.focus({ preventScroll: true });
}

/** A short tap tick. Call from a user gesture (click/pointer handlers). */
export function haptic(): void {
  if (typeof window === "undefined" || !hapticsEnabled()) return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(8);
    return;
  }
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) iosTick();
}

/** What counts as a "button" for feedback: real controls, not plain text links. */
export const HAPTIC_TARGETS =
  'button:not(:disabled), [role="button"], a.btn, a.btn-primary, a.btn-secondary, a.btn-ghost, a.tab, a.topnav-link, label.chip, label.option-card, label.toggle, summary, .quick-reply';
