import Link from "next/link";
import { ReadingPage } from "@/components/layout/Page";

export default function ThreadNotFound() {
  return (
    <ReadingPage>
      <div className="empty-state">
        {/* The page's heading: a page with none gives a screen reader nothing to land on. */}
        <h1 className="empty-state-title">Conversation not found</h1>
        <p className="empty-state-body">It may not exist, or you&apos;re not part of it.</p>
        <Link href="/messages" className="btn-primary mt-4">All messages</Link>
      </div>
    </ReadingPage>
  );
}
