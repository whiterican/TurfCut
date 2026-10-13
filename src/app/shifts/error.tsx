"use client";

import { PageError } from "@/components/PageError";

/** A shift page or one of its forms failed; keeps the nav instead of the app-wide crash page. */
export default function ShiftsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError title="Shifts didn't load" retry={retry} href="/dashboard" label="Today" />;
}
