import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="list" shape="cards" gap={6} label="Loading your feed" />;
}
