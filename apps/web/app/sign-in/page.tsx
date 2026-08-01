import { SignInForm } from "@/components/auth/SignInForm";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

type Props = {
  searchParams: { next?: string; error?: string };
};

export default async function SignInPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (user) {
    redirect(safeNext(searchParams.next));
  }

  return (
    <AppShell signedIn={false}>
      <div className="page">
        <SignInForm
          nextParam={searchParams.next ?? null}
          authError={searchParams.error ?? null}
          configured={hasSupabaseEnv()}
        />
      </div>
    </AppShell>
  );
}
