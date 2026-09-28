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

  const input =
    "w-full rounded-lg border px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white";

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Join Turfcut</h1>

        <div className="grid grid-cols-2 gap-2">
          {(["worker", "company"] as AccountType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAccountType(t)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                accountType === t
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : ""
              }`}
            >
              {t === "worker" ? "I'm a worker" : "I'm a company"}
            </button>
          ))}
        </div>

        <input
          className={input}
          required
          placeholder={accountType === "worker" ? "Display name" : "Company name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={input}
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={input}
          type="password"
          required
          minLength={6}
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-black py-2.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="text-sm text-neutral-500">
          Have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
