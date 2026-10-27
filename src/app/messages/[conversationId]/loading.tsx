import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="thread" width="2xl" gap={4} label="Loading conversation" />;
}
