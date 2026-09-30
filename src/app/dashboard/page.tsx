import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  WORKER: "Field worker",
  OWNER: "Organization owner",
  RECRUITER: "Recruiter",
  COMPLIANCE: "Compliance",
  SUPERVISOR: "Supervisor",
  FINANCE: "Finance",
};

export default async function DashboardPage() {
  const session = await requireAuth();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Signed in as <span className="font-medium">{session.email}</span>
        </p>
        <p className="inline-block rounded-full border px-3 py-1 text-sm">
          {ROLE_LABELS[session.role] ?? session.role}
        </p>
        {session.role === "WORKER" && (
          <p className="space-x-4 text-sm">
            <Link href="/profile" className="underline">My profile</Link>
          </p>
        )}
        {session.orgId && (
          <p className="text-sm text-neutral-500">Org ID: {session.orgId}</p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border px-5 py-2.5 text-sm"
          >
            Sign out
          </button>
        </form>
        <p className="text-xs text-neutral-500">
          M1: worker profiles, scorecards and political-fit consent. Jobs and
          matching land in M2–M3.
        </p>
      </div>
    </main>
  );
}
