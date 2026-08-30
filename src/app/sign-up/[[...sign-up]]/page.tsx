import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AuthShell } from "../../../components/auth-shell";

export default async function SignUpPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect("/dashboard");

  return (
    <AuthShell title="Create your Reverb account" description="Start managing campaigns with a secure Reverb session.">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/dashboard"
        signInFallbackRedirectUrl="/dashboard"
        appearance={{ variables: { colorPrimary: "#155eef", borderRadius: "0.5rem" } }}
      />
    </AuthShell>
  );
}