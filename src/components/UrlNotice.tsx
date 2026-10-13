"use client";

import { useEffect, useState } from "react";

/**
 * A confirmation carried in the URL after a redirect (e.g. "?setup=done").
 * The status region is in the page first and the text arrives a moment
 * later, so screen readers announce it; the flag then leaves the address,
 * so a reload or a later refresh of the page doesn't repeat it (Back and
 * Forward may still restore the page as it was). Needs JavaScript, like the
 * rest of the app.
 */
export function UrlNotice({ param, message }: { param: string; message: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setText(message), 100);
    const url = new URL(window.location.href);
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => window.clearTimeout(t);
  }, [param, message]);
  return <p role="status" className="text-success-msg">{text}</p>;
}
