import { safeNext } from "@/lib/auth-input";
import { LoginForm } from "./LoginForm";
import { ForgetSavedPages } from "@/components/OfflineBrief";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; closed?: string }> }) {
  const { next, error, closed } = await searchParams;
  return (
    <main className="page-narrow flex flex-1 flex-col justify-center">
      <ForgetSavedPages />
      {closed === "1" && (
        <p role="status" className="alert-success mb-4">
          Your account is closed. Your login is gone; your work history stays as it was recorded.
        </p>
      )}
      {error === "link" && (
        <p role="alert" className="alert-warning mb-4">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      )}
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
