import { BadgeCheck } from "lucide-react";

/**
 * Turfcut's mark that a campaign profile is its organization's official
 * account (M10.5). Staff verify by hand; the mark is information for the
 * reader, never a ranking input, and a profile without it is not "less".
 */
export function VerifiedMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="tag-accent inline-flex items-center gap-1" title="Turfcut confirmed this is the organization's official campaign account.">
      <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
      {compact ? <span className="sr-only">Verified by Turfcut</span> : null}
      <span aria-hidden={compact ? true : undefined}>Verified</span>
      {!compact && <span className="sr-only"> by Turfcut</span>}
    </span>
  );
}
