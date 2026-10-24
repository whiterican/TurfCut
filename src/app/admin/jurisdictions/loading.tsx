import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="list" framed={false} label="Loading jurisdictions" />;
}
