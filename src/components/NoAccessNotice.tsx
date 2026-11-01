"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NO_ACCESS_PARAM } from "@/lib/no-access";

/**
 * Says why someone landed here when a guard turned them away from a page
 * their role doesn't reach (#113 review). Keyed on the path, so it starts
 * empty on every page. It reads the address itself rather than
 * useSearchParams, which would need a loading boundary in the root layout
 * (the offline brief needs real status codes: field-routes-status.test.ts).
 * So a server action redirected back to the page already open isn't noticed
 * until that page is next opened; the flag waits in the address till then.
 */
export function NoAccessNotice() {
  const pathname = usePathname();
  return <Notice key={pathname} />;
}

function Notice() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get(NO_ACCESS_PARAM) !== "1") return;
    // A beat after the empty region is in the page, so screen readers announce it;
    // then the flag leaves the address, so a reload doesn't repeat it.
    const t = window.setTimeout(() => {
      setShown(true);
      window.setTimeout(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(NO_ACCESS_PARAM)) return;
        url.searchParams.delete(NO_ACCESS_PARAM);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }, 0);
    }, 100);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div role="status" className="no-access-notice">
      {shown && (
        <p className="alert-info">
          Your role doesn&apos;t include the page you opened, so you&apos;re here instead. An owner can change what your role reaches.
        </p>
      )}
    </div>
  );
}
