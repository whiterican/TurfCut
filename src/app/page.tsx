import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionProfile();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Turfcut</h1>
      <p className="mt-3 max-w-md text-neutral-600 dark:text-neutral-400">
        The marketplace for political field work. Petition signature gathering
        first, canvassing second. Workers are 1099 contractors; companies post
        jobs, verify work, and pay in-app.
      </p>
      <div className="mt-8 flex gap-4">
        {session ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-black px-5 py-2.5 text-white dark:bg-white dark:text-black"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg bg-black px-5 py-2.5 text-white dark:bg-white dark:text-black"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border px-5 py-2.5"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
      <p className="mt-12 text-xs text-neutral-500">
        M0 build — foundation only. Patent pending.
      </p>
    </main>
  );
}
