/**
 * One place that turns a data-layer refusal into an HTTP status.
 *
 * Data functions return `{ ok: false, code?, reason }`. `code` is the
 * machine-readable kind of refusal; `reason` is the human sentence shown to
 * the user and may be reworded freely. Routes call `failureStatus` (or
 * `failureResponse`) instead of matching on the wording.
 */
export type ErrorCode = "not_found" | "forbidden" | "invalid" | "conflict" | "rate_limited";

export const STATUS_FOR: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  invalid: 400,
  conflict: 409,
  rate_limited: 429,
};

export type Failure = { ok: false; reason: string; code?: ErrorCode; errors?: Record<string, string> };

/**
 * The status for a refusal. A `code` wins; field errors mean 400; anything
 * else gets `fallback` (409 by default: the request was understood but the
 * current state refuses it).
 */
export function failureStatus(r: Pick<Failure, "code" | "errors"> & { reason?: string }, fallback = 409): number {
  if (r.code) return STATUS_FOR[r.code];
  // Legacy: data functions not yet migrated to codes still say "… not found."
  // Kept here, and only here, until every refusal carries a code.
  if (r.reason && /not found/i.test(r.reason)) return 404;
  if (r.errors && Object.keys(r.errors).length) return 400;
  return fallback;
}

/** `{ error: reason, errors?, code? }` with the mapped status. */
export function failureResponse(r: Failure, fallback = 409): Response {
  return Response.json(
    { error: r.reason, ...(r.errors ? { errors: r.errors } : {}), ...(r.code ? { code: r.code } : {}) },
    { status: failureStatus(r, fallback) },
  );
}
