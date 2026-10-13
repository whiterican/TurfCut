import { EyeOff } from "lucide-react";

/**
 * Stands in for a figure the worker hasn't chosen to share with this
 * organization (C2 sharing settings). Never a zero, never a blank that reads
 * as "bad": just not shared.
 */
export function NotSharedChip({ what }: { what?: string }) {
  return (
    <span className="badge-dashed" title={what ? `The worker hasn't shared their ${what} with you` : "The worker hasn't shared this with you"}>
      <EyeOff aria-hidden className="size-3" />
      Not shared
      {what && <span className="sr-only">: {what}</span>}
    </span>
  );
}
