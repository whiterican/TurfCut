"use client";

import { useEffect, useState } from "react";

/**
 * After a live job was edited (C4.3): what changed and how many people were
 * told, carried in the URL by the save and shown once (the flag then leaves
 * the address, as UrlNotice does).
 */
export function JobChangedNotice() {
  const [text, setText] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const changed = url.searchParams.get("changed");
    if (changed === null) return;
    const told = Number(url.searchParams.get("told") ?? 0);
    const material = url.searchParams.get("material") === "1";
    const who = told === 0 ? "nobody was on the job to tell" : `${told} ${told === 1 ? "person was" : "people were"} told`;
    const t = window.setTimeout(
      () => setText(changed === "none" ? "Saved. Nothing had changed." : `Saved. Changed: ${changed}; ${who}.${material ? " Hired workers may leave within 24 hours with no penalty." : ""}`),
      100
    );
    for (const k of ["changed", "told", "material"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return () => window.clearTimeout(t);
  }, []);
  return <p role="status" className="text-success-msg">{text}</p>;
}
