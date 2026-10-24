import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="cards" width="2xl" gap={6} filters={false} label="Loading campaigns" />;
}
