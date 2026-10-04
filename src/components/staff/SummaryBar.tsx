/** A row of headline figures over a staff page ("12 applied · 3 short"). Tabular figures; no single score. */
export function SummaryBar({ items, label }: { items: Array<{ label: string; value: string | number; hint?: string }>; label: string }) {
  return (
    <section aria-label={label}>
      <dl className="summary-bar">
        {items.map((i) => (
          <div key={i.label} className="summary-item">
            <dt className="eyebrow">{i.label}</dt>
            <dd className="summary-value">{i.value}</dd>
            {i.hint && <dd className="text-hint">{i.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
