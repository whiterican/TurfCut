import { safeNext } from "@/lib/auth-input";
import { LoginForm } from "./LoginForm";
import { ForgetSavedPages } from "@/components/OfflineBrief";
import { HeroPage } from "@/components/layout/Page";
import { HeroArt } from "@/components/layout/HeroArt";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; closed?: string }> }) {
  const { next, error, closed } = await searchParams;
  return (
    // Sign-in (redesign §5): the art beside the form from 1024, a band above it on a phone; never fields over a picture.
    <HeroPage>
      <div className="hero-split">
        <HeroArt />
        <div className="hero-split-form">
          <div className="w-full max-w-md">
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
      {error === "config" && (
        <p role="alert" className="alert-warning mb-4">
          Sign-in isn&apos;t set up on this server yet. Once it is, sign in with your password or ask for a new link.
        </p>
      )}
      <LoginForm next={safeNext(next)} />
          </div>
        </div>
      </div>
    </HeroPage>
  );
}
