import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="detail" template="record" panel label="Loading job" />;
}
