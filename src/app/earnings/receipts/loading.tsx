import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="list" shape="list" label="Loading receipts" />;
}
