import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="reading" shape="form" gap={6} label="Loading profile setup" />;
}
