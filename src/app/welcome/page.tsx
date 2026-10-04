import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { WelcomeForm } from "./WelcomeForm";

/** A signed-in login with no Turfcut profile yet (see needsSetup). */
export default async function WelcomePage() {
  if (!(await needsSetup())) redirect("/dashboard");
  return (
    <main className="page-narrow flex flex-1 flex-col justify-center">
      <WelcomeForm />
    </main>
  );
}
