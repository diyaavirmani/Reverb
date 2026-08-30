import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AuthShell } from "../../../components/auth-shell";

export default async function SignInPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect("/dashboard");

  return (
    <AuthShell title="Welcome back" description="Sign in to continue to Reverb.">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
        appearance={{ variables: { colorPrimary: "#155eef", borderRadius: "0.5rem" } }}
      />
    </AuthShell>
  );
}