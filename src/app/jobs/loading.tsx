"use client";

import { PageSkeleton } from "@/components/PageSkeleton";
import { useViewerKind } from "@/components/ViewerKind";

/** Work is two pages: workers get the feed of cards, organizations their jobs table. */
export default function Loading() {
  return useViewerKind() === "org" ? <PageSkeleton shape="table" width="4xl" label="Loading jobs" /> : <PageSkeleton shape="cards" label="Loading jobs" />;
}
