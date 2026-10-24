import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="detail" framed={false} label="Loading campaign" />;
}
