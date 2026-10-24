/**
 * Explicit failure codes for domain results, so an API route picks its HTTP
 * status from the code rather than from the wording of the message (which
 * is written for people and may change). A result without a code is a rule
 * refusal: 409, a conflict with the current state.
 */
export type ErrorCode = "not_found" | "forbidden" | "rate_limited" | "invalid" | "conflict";

export const STATUS_OF: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  rate_limited: 429,
  invalid: 400,
  conflict: 409,
};

/** A failed result carrying its code. */
export const fail = <C extends ErrorCode>(code: C, reason: string) => ({ ok: false as const, reason, code });

/** The code of a failed result; uncoded refusals are conflicts. */
export function codeOf(r: { reason: string; code?: unknown }): ErrorCode {
  return typeof r.code === "string" && r.code in STATUS_OF ? (r.code as ErrorCode) : "conflict";
}
