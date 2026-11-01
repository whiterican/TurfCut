/** Initials in a circle; team chats get the eggplant feature colour (the raised eggplant tile by night). Purely decorative. */
export function Avatar({ name, team = false, size = "md", tone }: { name: string; team?: boolean; size?: "sm" | "md" | "lg"; tone?: "sky" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`avatar ${team ? "avatar-team" : ""} ${tone ? `avatar-${tone}` : ""} ${size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-[72px] text-2xl" : ""}`}>
      {initials || "•"}
    </span>
  );
}
