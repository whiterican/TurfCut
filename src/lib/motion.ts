/**
 * Motion foundation (P1.1). The stylesheet owns the tokens (app/globals.css,
 * "Motion"); this is their mirror for animations driven from script, plus
 * the one switch they all read: motion is reduced when the phone says so
 * (prefers-reduced-motion) or when the person chose "Less motion" in
 * Display settings (saved on the device as <html data-motion="reduce">).
 * src/lib/motion.test.ts holds the two in step.
 */

/** Where the "Less motion" choice is remembered (this device only). */
export const MOTION_KEY = "turfcut-motion";
export type MotionChoice = "system" | "reduce";

/** Durations in milliseconds, the same values as --dur-* in the stylesheet. */
export const DURATION = {
  /** A press, a colour change, a toggle: felt, not watched. */
  fast: 120,
  /** A control changing shape, a card settling, a count ticking up. */
  base: 220,
  /** A page sliding. */
  page: 320,
  /** A sheet, a ring filling, the tab lens gliding. */
  slow: 360,
  /** The pause before a new page fades in, behind the old one going. */
  lag: 90,
} as const;

/**
 * A damped spring sampled for CSS linear(): critically close to settled,
 * with one small overshoot, so a sheet or a card lands rather than stops.
 * The same function makes the token in the stylesheet (motion.test.ts
 * checks it), so one curve means one feel everywhere.
 */
export function springCurve(opts: { stiffness?: number; damping?: number; mass?: number; steps?: number } = {}): string {
  const { stiffness = 170, damping = 20, mass = 1, steps = 24 } = opts;
  // Underdamped spring from x=1 to x=0, normalized so the curve runs 0 → 1 over its duration.
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(Math.max(1 - zeta * zeta, 1e-6));
  // The duration the curve spans: when the envelope has decayed to 0.5%.
  const duration = Math.log(1 / 0.005) / (zeta * w0);
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    const x = Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    const y = i === steps ? 1 : 1 - x;
    points.push(Number(y.toFixed(4)).toString());
  }
  return `linear(${points.join(", ")})`;
}

/** True when animations should not run: the phone's setting, or the app's. Server: false. */
export function motionReduced(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "reduce") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A duration for script-driven motion: the token, or nothing when motion is reduced. */
export const duration = (kind: keyof typeof DURATION): number => (motionReduced() ? 0 : DURATION[kind]);

/**
 * The inline script's part for motion (runs before first paint with the
 * theme's): the saved "Less motion" choice is applied as <html data-motion>
 * so nothing animates on the first page either.
 */
export const MOTION_INIT_FRAGMENT = `var m=localStorage.getItem(${JSON.stringify(MOTION_KEY)});if(m==="reduce")document.documentElement.dataset.motion="reduce";`;
