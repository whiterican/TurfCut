/** Initials in a circle; team chats get the dark hero colour. Purely decorative. */
export function Avatar({ name, team = false, size = "md", tone }: { name: string; team?: boolean; size?: "sm" | "md"; tone?: "coral" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`avatar ${team ? "avatar-team" : ""} ${tone === "coral" ? "avatar-coral" : ""} ${size === "sm" ? "size-8 text-xs" : ""}`}>
      {initials || "•"}
    </span>
  );
}
