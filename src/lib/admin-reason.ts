/**
 * The reason behind a staff act (M10): a few words at least, never
 * whitespace alone. Browser-safe on purpose (no database import), so forms
 * can share the limits with the server without pulling Prisma into a client
 * bundle.
 */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** The trimmed reason, or what to tell the person. */
export function checkReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < REASON_MIN) return { ok: false, message: "Say why, in a few words. Every staff action is recorded with its reason." };
  if (reason.length > REASON_MAX) return { ok: false, message: `Keep the reason to ${REASON_MAX} characters or fewer.` };
  return { ok: true, reason };
}
