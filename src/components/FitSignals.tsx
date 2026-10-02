import { FIT_FIELDS, type EmployerFitView } from "@/lib/political-fit";

/**
 * Political-fit signals as an organization sees them. "Not shared" is styled
 * exactly like any neutral value — no warning colour, icon or ordering
 * penalty — because withholding is never a signal.
 */
export function FitSignals({ view }: { view: EmployerFitView }) {
  return (
    <div className="space-y-3">
      <dl className="list-card">
        {FIT_FIELDS.map((f) => {
          const field = view.fields[f.key];
          return (
            <div key={f.key} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-muted">{f.label}</dt>
              <dd className="text-fg sm:text-right">
                {field.shared ? field.lines.map((l) => <span key={l} className="block">{l}</span>) : "Not shared"}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-hint">{view.basis}</p>
    </div>
  );
}
