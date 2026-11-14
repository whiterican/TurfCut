import type { Metadata } from "next";
import Link from "next/link";
import { ReadingPage } from "@/components/layout/Page";
import { getSessionProfile } from "@/lib/auth";
import { orgNav } from "@/lib/nav";

export const metadata: Metadata = { title: "Page not found · Turfcut" };

/**
 * The page for an address with nothing behind it, and for every notFound() in the app. Many of those are
 * guards: a job, shift or conversation that exists and is not this person's answers exactly as one that does
 * not exist. So the words here never say which it was.
 *
 * Without this file Next.js drew its own bare "404" inside the app's shell, with no heading the app styles, no
 * main landmark and no way on.
 */
export default async function NotFound() {
  // Home is where the site's own mark leads: the landing page signed out, a worker's Today, an organization's Desk.
  const session = await getSessionProfile().catch(() => null);
  // The same test the layout uses for the organization's shell: anyone with its rail has a Desk.
  const isOrg = orgNav(session?.role ?? null, !!session?.orgId, !!session?.staff, session?.grants ?? null).rail.length > 0;
  const home = !session ? "/" : isOrg ? "/desk" : "/dashboard";
  return (
    <ReadingPage head={<h1 className="page-title">Page not found</h1>}>
      <p className="lead">There is nothing here for you to open. The address may be wrong, or it may lead to something that was removed or that your account cannot see.</p>
      <div>
        <Link href={home} className="btn-primary">Go to Home</Link>
      </div>
    </ReadingPage>
  );
}
