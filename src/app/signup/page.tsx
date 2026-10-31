import { SignupForm } from "./SignupForm";
import { ForgetSavedPages } from "@/components/OfflineBrief";
import { HeroPage } from "@/components/layout/Page";
import { HeroArt } from "@/components/layout/HeroArt";

/** Sign-up (redesign §5): the art beside the form from 1024, a band above it on a phone; never fields over a picture. */
export default function SignupPage() {
  return (
    <HeroPage>
      <div className="hero-split">
        <HeroArt />
        <div className="hero-split-form">
          <div className="w-full max-w-md">
            <ForgetSavedPages />
            <SignupForm />
          </div>
        </div>
      </div>
    </HeroPage>
  );
}
