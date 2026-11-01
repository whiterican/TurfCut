import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="reading" shape="detail" gap={8} label="Loading preview" />;
}
