/** P1.6: when a dragged sheet is let go, does it leave or settle back? Pure, for the test. */
export const SHEET_DISMISS_FRACTION = 0.3;
export const SHEET_FLICK_PX_PER_MS = 0.5;
export function sheetRelease(dy: number, vy: number, height: number): "dismiss" | "settle" {
  if (!Number.isFinite(dy) || !Number.isFinite(height) || height <= 0 || dy <= 0) return "settle";
  if (dy >= height * SHEET_DISMISS_FRACTION) return "dismiss";
  if (dy >= 24 && Number.isFinite(vy) && vy >= SHEET_FLICK_PX_PER_MS) return "dismiss";
  return "settle";
}
