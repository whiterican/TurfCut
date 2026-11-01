import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { requireStaff } from "@/lib/staff-session";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { StaffRail } from "@/components/admin/StaffRail";

/**
 * Next collects a layout's metadata even when the layout answers 404, so a
 * static title here would name the console on the not-found page. The title
 * exists only for staff (the session is cached: no second query).
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionProfile().catch(() => null);
  return session?.staff ? { title: "Admin · Turfcut", robots: { index: false, follow: false } } : {};
}

/**
 * The admin console's frame (M10.1): staff only, every section behind the
 * same gate. Its own identity (redesign §4.2.1): a "Turfcut staff" band, and
 * its own rail of the console's sections, never an organization's beside it
 * (globals.css hides that one here).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <>
      <div className="staff-band">
        <p className="flex min-w-0 items-center gap-2 font-bold">
          <ShieldCheck aria-hidden className="size-4 shrink-0" />
          Turfcut staff
        </p>
        <p className="staff-band-note">Everything you do here is recorded with your name and your reason.</p>
        <Link href="/dashboard" className="staff-band-link">Leave admin</Link>
      </div>
      <div className="admin-shell">
        <StaffRail sections={ADMIN_SECTIONS} />
        <main className="page min-w-0 flex-1">
          <header className="page-header">
            <h1 className="page-title">Admin</h1>
          </header>
          <div className="lg:hidden">
            <AdminSectionNav sections={ADMIN_SECTIONS} />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
