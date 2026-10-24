"use client";

import { useSyncExternalStore } from "react";
import { DISPLAY_EVENT, TEXT_SIZE_KEY, TEXT_SIZES, THEME_CHOICES, applyThemeClasses, currentTheme, setTheme, type TextSize, type ThemeChoice } from "@/lib/theme";
import { HAPTICS_KEY, canVibrate, haptic } from "@/lib/haptics";
import { MOTION_KEY, type MotionChoice } from "@/lib/motion";


/**
 * A tiny store over <html> + localStorage. Every write notifies listeners
 * directly (the class may not change, e.g. choosing "Dark" on a dark phone),
 * the `storage` event keeps other tabs in sync, and the last choice is kept
 * in memory for when storage is unavailable (private mode).
 */
const EVENT = DISPLAY_EVENT;
const notify = () => window.dispatchEvent(new Event(EVENT));

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  // "Match my phone" follows the phone live while no theme is saved.
  const follow = () => {
    if (currentTheme() === "system") applyThemeClasses("system");
    cb();
  };
  mq.addEventListener("change", follow);
  // The Motion label changes when the phone's own setting does.
  const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionMq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", follow);
    motionMq.removeEventListener("change", cb);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // Storage unavailable: the choice lasts for this page.
  }
}

const themeSnapshot = (): ThemeChoice => currentTheme();
const sizeSnapshot = (): TextSize => {
  const v = document.documentElement.getAttribute("data-text");
  return v === "lg" || v === "xl" ? v : "md";
};

function applySize(v: TextSize) {
  const html = document.documentElement;
  if (v === "md") html.removeAttribute("data-text");
  else html.setAttribute("data-text", v);
  save(TEXT_SIZE_KEY, v === "md" ? null : v);
  notify();
}
const applyTheme = (v: ThemeChoice) => setTheme(v);

const motionSnapshot = (): MotionChoice => (document.documentElement.getAttribute("data-motion") === "reduce" ? "reduce" : "system");
/** Whether the phone itself asks for less motion (then "Match my phone" already means less). */
const phoneReducesMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function applyMotion(v: MotionChoice) {
  const html = document.documentElement;
  if (v === "reduce") html.setAttribute("data-motion", "reduce");
  else html.removeAttribute("data-motion");
  save(MOTION_KEY, v === "reduce" ? "reduce" : null);
  notify();
}

const hapticsSnapshot = () => read(HAPTICS_KEY) !== "off";
const vibratingPhone = () => canVibrate() && window.matchMedia("(pointer: coarse)").matches;
function applyHaptics(on: boolean) {
  save(HAPTICS_KEY, on ? null : "off");
  notify();
  if (on) haptic(); // a sample tick
}

export function DisplaySettings() {
  const size = useSyncExternalStore(subscribe, sizeSnapshot, () => "md" as TextSize);
  const theme = useSyncExternalStore(subscribe, themeSnapshot, () => "system" as ThemeChoice);
  const haptics = useSyncExternalStore(subscribe, hapticsSnapshot, () => true);
  const motion = useSyncExternalStore(subscribe, motionSnapshot, () => "system" as MotionChoice);
  const phoneReduces = useSyncExternalStore(subscribe, phoneReducesMotion, () => false);
  // Known only in the browser. The server assumes it can, so Android never
  // flickers; iPhone and computers swap the switch for the explanation right
  // after hydration. Desktop Chrome has the Vibration API but nothing to buzz.
  const vibrates = useSyncExternalStore(subscribe, vibratingPhone, () => true);

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="section-title">Text size</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEXT_SIZES.map((t, i) => (
            <label key={t.value} className="option-card items-center">
              <input type="radio" name="textSize" checked={size === t.value} onChange={() => applySize(t.value)} />
              <span className="font-semibold text-fg" style={{ fontSize: `${1 + i * 0.125}rem` }}>
                {t.label}
              </span>
            </label>
          ))}
        </div>
        <p className="text-hint">Scales every screen. Saved on this device.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="section-title">Theme</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEME_CHOICES.map(({ value: v, label }) => (
            <label key={v} className="option-card items-center">
              <input type="radio" name="theme" checked={theme === v} onChange={() => applyTheme(v)} />
              <span className="font-semibold text-fg">{label}</span>
            </label>
          ))}
        </div>
        <p className="text-hint">Sunlight is for working outdoors: black on white, heavier lines and bolder text. Pair it with Large text if the screen is hard to read. The field-day screen has a Sunlight switch too. Saved on this device.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="section-title">Motion</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["system", phoneReduces ? "Match my phone (less motion)" : "Match my phone"], ["reduce", "Less motion"]] as const).map(([v, label]) => (
            <label key={v} className="option-card items-center">
              <input type="radio" name="motion" checked={motion === v} onChange={() => applyMotion(v)} />
              <span className="font-semibold text-fg">{label}</span>
            </label>
          ))}
        </div>
        <p className="text-hint">Less motion: pages swap instead of sliding and nothing presses or glides. Saved on this device.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="section-title">Feel</legend>
        {vibrates ? (
          <>
            <label className="toggle">
              <input type="checkbox" role="switch" checked={haptics} onChange={(e) => applyHaptics(e.target.checked)} />
              Vibrate lightly when I tap a button
            </label>
            <p className="text-hint">Saved on this device.</p>
          </>
        ) : (
          <p className="text-hint">
            This device can&apos;t vibrate when you tap a button. On iPhone, on/off switches (like the job filters) still give a light tick.
          </p>
        )}
      </fieldset>

      <div className="card space-y-2">
        <p className="eyebrow">Preview</p>
        <p className="text-lg font-bold text-fg">Denver housing initiative drive</p>
        <p className="text-muted-sm">Front Range Circulators · Denver, CO</p>
        <p className="text-hint">Small print looks like this.</p>
      </div>
    </div>
  );
}
