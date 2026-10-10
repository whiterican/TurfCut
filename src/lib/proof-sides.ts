/** A certificate photo's side (C3.6b); safe for the browser (proof-photos.ts is server-only). */
export const PROOF_SIDES = ["FRONT", "BACK"] as const;
export type ProofSide = (typeof PROOF_SIDES)[number];
export const SIDE_LABELS: Record<ProofSide, string> = { FRONT: "Front", BACK: "Back" };
/** What the worker may send: up to 4 MB (the server re-encodes within this too). */
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
