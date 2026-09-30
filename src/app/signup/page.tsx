"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { completeSignup } from "./actions";

type AccountType = "worker" | "company";

export default function SignupPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("worker");
  const [name, setName] = useState("");
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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Signup did not return a user.");

      // Create the Turfcut profile + worker/org rows (server-side, service role).
      const result = await completeSignup({
        userId: data.user.id,
        accountType,
        name,
      });
      if (!result.ok) throw new Error(result.error);

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-narrow">
      <form onSubmit={onSubmit} className="card space-y-5 sm:p-8">
        <div className="space-y-1">
          <h1 className="page-title">Join Turfcut</h1>
          <p className="text-muted-sm">Field workers and hiring companies each get their own account.</p>
        </div>

        <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2">
          {(["worker", "company"] as AccountType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={accountType === t}
              onClick={() => setAccountType(t)}
              className={accountType === t ? "btn-primary" : "btn-secondary"}
            >
              {t === "worker" ? "I'm a worker" : "I'm a company"}
            </button>
          ))}
        </div>

        <label className="block space-y-1.5">
          <span className="label">{accountType === "worker" ? "Display name" : "Company name"}</span>
          <input
            className="field"
            required
            autoComplete={accountType === "worker" ? "name" : "organization"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="text-hint block">At least 6 characters.</span>
        </label>
        {error && <p role="alert" className="text-danger-msg">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="text-muted-sm text-center">
          Have an account?{" "}
          <Link href="/login" className="link">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
