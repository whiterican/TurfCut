import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canCreateGroup } from "@/lib/chat";
import { teamChatJobs } from "@/lib/chat-data";
import { NewTeamChatForm } from "@/components/chat/NewTeamChatForm";

export const metadata = { title: "New team chat · Turfcut" };

export default async function NewTeamChatPage() {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, orgId: session.orgId };
  if (!canCreateGroup(me).ok) redirect("/messages");
  const jobs = await teamChatJobs(me);

  return (
    <main className="page max-w-2xl">
      <header className="space-y-1">
        <Link transitionTypes={["nav-back"]} href="/messages" className="link text-sm">← Messages</Link>
        <h1 className="page-title">New team chat</h1>
        <p className="text-muted-sm">
          One chat for a campaign or circulation team. Pick its jobs, then who&apos;s in it: your staff, and workers hired on those jobs.
          Workers can&apos;t join on their own.
        </p>
      </header>
      {jobs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No jobs to build a team around</p>
          <p className="empty-state-body">Publish a job and hire workers first — team chats are tied to jobs.</p>
          <Link href="/jobs" className="btn-primary mt-4">Your jobs</Link>
        </div>
      ) : (
        <NewTeamChatForm jobs={jobs.map((j) => ({ id: j.id, title: j.title, hired: j._count.engagements, status: j.status }))} />
      )}
    </main>
  );
}
