import Link from "next/link";

export default function ThreadNotFound() {
  return (
    <main className="page max-w-2xl">
      <div className="empty-state">
        <p className="empty-state-title">Conversation not found</p>
        <p className="empty-state-body">It may not exist, or you&apos;re not part of it.</p>
        <Link href="/messages" className="btn-primary mt-4">All messages</Link>
      </div>
    </main>
  );
}
