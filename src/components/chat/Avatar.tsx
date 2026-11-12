"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A person in a circle: their photo when one is given and loads, else their
 * initials. Team chats get the eggplant feature colour (the raised eggplant
 * tile by night). Purely decorative: the name is always beside it.
 */
export function Avatar({ name, photo, team = false, size = "md", tone }: { name: string; photo?: string | null; team?: boolean; size?: "sm" | "md" | "lg"; tone?: "sky" }) {
  const [failed, setFailed] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page came alive sent its error too early to be heard: look once.
  useEffect(() => {
    if (photo && img.current?.complete && img.current.naturalWidth === 0) setFailed(photo);
  }, [photo]);
  const initials = name
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const show = !!photo && failed !== photo;
  return (
    <span aria-hidden className={`avatar ${team ? "avatar-team" : ""} ${tone ? `avatar-${tone}` : ""} ${show ? "avatar-photo" : ""} ${size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-[72px] text-2xl" : ""}`}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by a signed-in route, not an optimizable public image
        <img ref={img} src={photo} alt="" loading="lazy" onError={() => setFailed(photo)} />
      ) : (
        initials || "•"
      )}
    </span>
  );
}
