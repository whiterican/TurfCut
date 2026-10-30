import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton template="workspace" shape="list" avatars label="Loading members" />;
}
