import type { Metadata } from "next";
import { requireStaff } from "@/lib/staff-session";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";

export const metadata: Metadata = { title: "Admin · Turfcut", robots: { index: false, follow: false } };

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
