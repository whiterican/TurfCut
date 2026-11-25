/** A v4 id made on the device. randomUUID needs a secure context and Safari 15.4; getRandomValues works everywhere this app does. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What a tap sends, apart from its id: the same form contents give the same text, in any field order. */
export function tapContents(fd: FormData): string {
  return JSON.stringify(
    [...fd.entries()]
      .filter(([k]) => k !== "clientId" && !k.startsWith("$ACTION"))
      .map(([k, v]) => [k, typeof v === "string" ? v : `file:${v.name}:${v.size}`])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
  );
}

/**
 * The id for a tap. One kept from a save that may have landed (a timeout) is reused only when this tap sends exactly
 * what that one did, so a retry counts once; if the worker changed anything first, it is a new tap with a new id,
 * and its change isn't answered "Already saved" and dropped.
 */
export function idForTap(kept: { id: string; contents: string } | null, contents: string): { id: string; contents: string } {
  return kept && kept.contents === contents ? kept : { id: newId(), contents };
}
