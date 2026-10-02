"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** datetime-local value (the person's own zone) → ISO in a hidden field; the server never guesses a zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The local rendering happens only on the phone (after mount): the server
 * doesn't know the zone. An unchanged time submits the original ISO value
 * exactly — the picker only shows minutes, and a count-only correction must
 * not move the time by the seconds it can't show.
 */
export function LocalDateTimeInput({ name, label, defaultIso, required = false }: { name: string; label: string; defaultIso?: string; required?: boolean }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const initial = mounted && defaultIso ? toLocal(defaultIso) : "";
  // null until the person touches the picker.
  const [edited, setEdited] = useState<string | null>(null);
  const v = edited ?? initial;
  const unchanged = !!defaultIso && v === initial;
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={unchanged ? "" : toIso(v)} />
      <input type="datetime-local" className="field" value={v} onChange={(e) => setEdited(e.target.value)} required={required} disabled={!mounted} />
    </label>
  );
}
