"use client";

import { PageError } from "@/components/PageError";

/** Pay or one of its forms failed; keeps the nav instead of the app-wide crash page. */
export default function PayError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError title="Pay didn't load" retry={retry} href="/jobs" label="Jobs" />;
}
