import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="form" width="2xl" gap={8} label="Loading availability" />;
}
