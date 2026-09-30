import { FIT_FIELDS, type EmployerFitView } from "@/lib/political-fit";

/**
 * Political-fit signals as an organization sees them. "Not shared" is styled
 * exactly like any neutral field — no warning colour, icon or ordering
 * penalty — because withholding is never a signal.
 */
export function FitSignals({ view }: { view: EmployerFitView }) {
  return (
    <div className="space-y-2">
      <dl className="divide-y rounded-lg border">
        {FIT_FIELDS.map((f) => {
          const field = view.fields[f.key];
          return (
            <div key={f.key} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <dt className="text-neutral-500">{f.label}</dt>
              <dd className="text-right">
                {field.shared ? field.lines.map((l) => <span key={l} className="block">{l}</span>) : "Not shared"}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-neutral-500">{view.basis}</p>
    </div>
  );
}
