"use client";

/** Prints the page (a receipt or a statement): the browser's own "save as PDF" does the rest. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary btn-sm no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
