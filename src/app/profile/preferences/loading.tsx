import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="reading" shape="form" gap={8} label="Loading preferences" />;
}
