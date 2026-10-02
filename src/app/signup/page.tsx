import { SignupForm } from "./SignupForm";
import { ForgetSavedPages } from "@/components/OfflineBrief";

export default function SignupPage() {
  return (
    <main className="page-narrow flex flex-1 flex-col justify-center">
      <ForgetSavedPages />
      <SignupForm />
    </main>
  );
}
