import { DisplaySettings } from "@/components/DisplaySettings";

export const metadata = { title: "Display settings · Turfcut" };

/** Display settings for everyone (signed in or not): text size and theme. */
export default function SettingsPage() {
  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Settings</p>
          <h1 className="page-title">Display</h1>
          <p className="text-muted-sm">Make Turfcut easier to read on your phone.</p>
        </div>
      </header>
      <DisplaySettings />
    </main>
  );
}
