import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { canManageChannels } from "@/lib/chat";
import { teamChatJobs } from "@/lib/chat-data";
import { NewChannelForm } from "@/components/chat/NewChannelForm";
import { ReadingPage } from "@/components/layout/Page";

export const metadata = { title: "New channel · Turfcut" };

export default async function NewChannelPage() {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId };
  if (!canManageChannels(me).ok) redirect("/messages/channels");
  const jobs = await teamChatJobs(me);
  return (
    <ReadingPage>
      <header className="space-y-1">
        <Link transitionTypes={["nav-back"]} href="/messages/channels" className="link inline-flex items-center gap-1 text-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />Channels</Link>
        <h1 className="page-title">New channel</h1>
        <p className="text-muted-sm">A named place for one subject, team or territory.</p>
      </header>
      <NewChannelForm jobs={jobs.map((j) => ({ id: j.id, title: j.title, hired: j._count.engagements }))} />
    </ReadingPage>
  );
}
