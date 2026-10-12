import { ExternalLink } from "lucide-react";
import { LinkedText } from "@/components/campaign/LinkedText";
import type { Fact } from "@/lib/campaign-kit-data";

/**
 * The supporting facts behind a talking point (S4), in the campaign's own
 * words, each with its source where the campaign gave one. Folded by
 * default: a tap opens them. Turfcut adds nothing and checks nothing.
 */
export function FactList({ facts, open = false }: { facts: Fact[]; open?: boolean }) {
  if (facts.length === 0) return null;
  return (
    <details className="group rounded-xl border border-border px-3 py-2" open={open}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-fg">
        <span className="group-open:hidden">Supporting facts ({facts.length})</span>
        <span className="hidden group-open:inline">Supporting facts</span>
      </summary>
      <ol className="mt-2 space-y-2 pl-5 text-sm text-fg" style={{ listStyle: "decimal" }}>
        {facts.map((f) => (
          <li key={f.id} className="space-y-0.5">
            <LinkedText text={f.body} />
            {f.sourceUrl && (
              <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="link inline-flex items-center gap-1 text-xs">
                Source <ExternalLink aria-hidden className="h-3 w-3" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
