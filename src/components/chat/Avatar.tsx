/** Initials in a circle; team chats get the accent fill with an eggplant trim by day, the hero colour by night. Purely decorative. */
export function Avatar({ name, team = false, size = "md", tone }: { name: string; team?: boolean; size?: "sm" | "md"; tone?: "sky" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`avatar ${team ? "avatar-team" : ""} ${tone ? `avatar-${tone}` : ""} ${size === "sm" ? "size-8 text-xs" : ""}`}>
      {initials || "•"}
    </span>
  );
}
