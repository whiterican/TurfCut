"use client";

import { useState } from "react";

/** datetime-local value (the person's own zone) → ISO in a hidden field; the server never guesses a zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function LocalDateTimeInput({ name, label, defaultIso, required = false }: { name: string; label: string; defaultIso?: string; required?: boolean }) {
  const [v, setV] = useState(defaultIso ? toLocal(defaultIso) : "");
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={toIso(v)} />
      <input type="datetime-local" className="field" value={v} onChange={(e) => setV(e.target.value)} required={required} />
    </label>
  );
}
