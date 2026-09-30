"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-narrow">
      <form onSubmit={onSubmit} className="card space-y-5 sm:p-8">
        <div className="space-y-1">
          <h1 className="page-title">Welcome back</h1>
          <p className="text-muted-sm">Log in to Turfcut.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="label">Email</span>
          <input
            className="field"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Password</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-danger-msg">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="text-muted-sm text-center">
          No account?{" "}
          <Link href="/signup" className="link">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
