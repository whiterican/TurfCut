"use client";

import { PageSkeleton } from "@/components/PageSkeleton";
import { useViewerKind } from "@/components/ViewerKind";

/** Work is two pages: workers get the feed of cards, organizations their jobs table. */
export default function Loading() {
  return useViewerKind() === "org" ? <PageSkeleton template="list" shape="table" label="Loading jobs" /> : <PageSkeleton shape="cards" label="Loading jobs" />;
}
