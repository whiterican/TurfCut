import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton shape="detail" template="reading" panel panelStart label="Loading profile" />;
}
