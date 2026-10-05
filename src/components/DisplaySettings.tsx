"use client";

import { useSyncExternalStore } from "react";
import { TEXT_SIZE_KEY, TEXT_SIZES, THEME_STORAGE_KEY, type TextSize } from "@/lib/theme";
import { HAPTICS_KEY, canVibrate, haptic } from "@/lib/haptics";

type ThemeChoice = "system" | "light" | "dark";

/**
 * A tiny store over <html> + localStorage. Every write notifies listeners
 * directly (the class may not change, e.g. choosing "Dark" on a dark phone),
 * the `storage` event keeps other tabs in sync, and the last choice is kept
 * in memory for when storage is unavailable (private mode).
 */
const EVENT = "turfcut-display";
let lastTheme: ThemeChoice | null = null;
const notify = () => window.dispatchEvent(new Event(EVENT));

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  // "Match my phone" follows the phone live while no theme is saved.
  const follow = () => {
    if (themeSnapshot() === "system") document.documentElement.classList.toggle("dark", !mq.matches);
    cb();
  };
  mq.addEventListener("change", follow);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", follow);
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

function themeSnapshot(): ThemeChoice {
  const stored = read(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return lastTheme ?? "system";
}
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
function applyTheme(v: ThemeChoice) {
  lastTheme = v;
  save(THEME_STORAGE_KEY, v === "system" ? null : v);
  const dark = v === "system" ? !window.matchMedia("(prefers-color-scheme: light)").matches : v === "dark";
  document.documentElement.classList.toggle("dark", dark);
  notify();
}

const hapticsSnapshot = () => read(HAPTICS_KEY) !== "off";
function applyHaptics(on: boolean) {
  save(HAPTICS_KEY, on ? null : "off");
  notify();
  if (on) haptic(); // a sample tick
}

export function DisplaySettings() {
  const size = useSyncExternalStore(subscribe, sizeSnapshot, () => "md" as TextSize);
  const theme = useSyncExternalStore(subscribe, themeSnapshot, () => "system" as ThemeChoice);
  const haptics = useSyncExternalStore(subscribe, hapticsSnapshot, () => true);
  // Known only in the browser. The server assumes it can, so Android never
  // flickers; iPhone swaps the switch for the explanation right after hydration.
  const vibrates = useSyncExternalStore(subscribe, canVibrate, () => true);

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="section-title">Text size</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEXT_SIZES.map((t, i) => (
            <label key={t.value} className="option-card items-center">
              <input type="radio" name="textSize" checked={size === t.value} onChange={() => applySize(t.value)} className="size-4 shrink-0" />
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
        <div className="grid gap-2 sm:grid-cols-3">
          {([["system", "Match my phone"], ["light", "Light"], ["dark", "Dark"]] as const).map(([v, label]) => (
            <label key={v} className="option-card items-center">
              <input type="radio" name="theme" checked={theme === v} onChange={() => applyTheme(v)} className="size-4 shrink-0" />
              <span className="font-semibold text-fg">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="section-title">Feel</legend>
        {vibrates ? (
          <>
            <label className="toggle">
              <input type="checkbox" role="switch" switch="" checked={haptics} onChange={(e) => applyHaptics(e.target.checked)} />
              Vibrate lightly when I tap a button
            </label>
            <p className="text-hint">Saved on this device.</p>
          </>
        ) : (
          <p className="text-hint">
            This browser can&apos;t vibrate when you tap a button. On iPhone, Turfcut&apos;s on/off switches still give a light tick.
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
