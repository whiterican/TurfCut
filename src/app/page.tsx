import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionProfile();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <span className="badge-lavender">Private pilot</span>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
        Field work, verified.
      </h1>
      <p className="lead mt-4 max-w-lg">
        The marketplace for political field work. Petition signature gathering
        first, canvassing second. Workers are 1099 contractors; companies post
        jobs, verify work, and pay in-app.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        {session ? (
          <Link href="/dashboard" className="btn-primary px-6">
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn-primary px-6">
              Log in
            </Link>
            <Link href="/signup" className="btn-secondary px-6">
              Sign up
            </Link>
          </>
        )}
      </div>
      <p className="text-hint mt-14">Patent pending.</p>
    </main>
  );
}
