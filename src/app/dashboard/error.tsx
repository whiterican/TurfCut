"use client";

import Link from "next/link";
import { useViewerKind } from "@/components/ViewerKind";

/**
 * The dashboard couldn't load (a query failed, e.g. a table missing before a
 * migration ran). Says so in the viewer's terms and offers a retry and a
 * page that doesn't depend on this one, instead of the app-wide crash page.
 */
export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const kind = useViewerKind();
  const copy =
    kind === "worker"
      ? { title: "Today didn't load", body: "Check your connection and try again. Your shifts and pay are unchanged.", href: "/shifts", label: "My shifts" }
      : kind === "org"
        ? { title: "Operations didn't load", body: "Something went wrong loading your organization's overview. Nothing was changed; try again.", href: "/jobs", label: "Jobs" }
        : { title: "This page didn't load", body: "Something went wrong on our side. Nothing was changed; try again.", href: "/settings", label: "Settings" };
  return (
    <main className="page max-w-2xl">
      <div className="empty-state" role="alert">
        <p className="empty-state-title">{copy.title}</p>
        <p className="empty-state-body">{copy.body}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => retry()}>Try again</button>
          <Link href={copy.href} className="btn-secondary">{copy.label}</Link>
        </div>
      </div>
    </main>
  );
}
