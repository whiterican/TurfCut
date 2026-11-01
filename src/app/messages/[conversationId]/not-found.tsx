import Link from "next/link";
import { ReadingPage } from "@/components/layout/Page";

export default function ThreadNotFound() {
  return (
    <ReadingPage>
      <div className="empty-state">
        <p className="empty-state-title">Conversation not found</p>
        <p className="empty-state-body">It may not exist, or you&apos;re not part of it.</p>
        <Link href="/messages" className="btn-primary mt-4">All messages</Link>
      </div>
    </ReadingPage>
  );
}
