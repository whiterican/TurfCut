import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/auth";
import { requireStaff } from "@/lib/staff-session";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";

/**
 * Next collects a layout's metadata even when the layout answers 404, so a
 * static title here would name the console on the not-found page. The title
 * exists only for staff (the session is cached: no second query).
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionProfile().catch(() => null);
  return session?.staff ? { title: "Admin · Turfcut", robots: { index: false, follow: false } } : {};
}

/** The admin console's frame (M10.1): staff only, every section behind the same gate. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Turfcut staff</p>
          <h1 className="page-title">Admin</h1>
          <p className="text-muted-sm">Everything you do here is recorded with your name and your reason.</p>
        </div>
      </header>
      <AdminSectionNav sections={ADMIN_SECTIONS} />
      {children}
    </main>
  );
}
