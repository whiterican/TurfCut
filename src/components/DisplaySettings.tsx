"use client";

import { useSyncExternalStore } from "react";
import { TEXT_SIZE_KEY, TEXT_SIZES, THEME_STORAGE_KEY, type TextSize } from "@/lib/theme";

/** Re-render when <html>'s class or data-text changes. */
function subscribe(cb: () => void) {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-text"] });
  return () => o.disconnect();
}
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page.
  }
};

/** DOM + storage writes live outside the component (React compiler rule). */
function applySize(v: TextSize) {
  const html = document.documentElement;
  if (v === "md") html.removeAttribute("data-text");
  else html.setAttribute("data-text", v);
  save(TEXT_SIZE_KEY, v === "md" ? null : v);
}
function applyTheme(v: "system" | "light" | "dark") {
  const dark = v === "system" ? !window.matchMedia("(prefers-color-scheme: light)").matches : v === "dark";
  save(THEME_STORAGE_KEY, v === "system" ? null : v);
  document.documentElement.classList.toggle("dark", dark);
}

export function DisplaySettings() {
  const size = useSyncExternalStore(subscribe, () => (document.documentElement.dataset.text as TextSize | undefined) ?? "md", () => "md");
  const theme = useSyncExternalStore(subscribe, () => read(THEME_STORAGE_KEY) ?? "system", () => "system");


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

      <div className="card space-y-2">
        <p className="eyebrow">Preview</p>
        <p className="text-lg font-bold text-fg">Denver housing initiative drive</p>
        <p className="text-muted-sm">Front Range Circulators · Denver, CO</p>
        <p className="text-hint">Small print looks like this.</p>
      </div>
    </div>
  );
}
