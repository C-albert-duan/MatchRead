import { SignInForm } from "@/components/SignInForm";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

type Props = {
  searchParams: { next?: string };
};

export default async function SignInPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (user) {
    redirect(safeNext(searchParams.next));
  }

  return (
    <AppShell signedIn={false}>
      <SignInForm
        nextParam={searchParams.next ?? null}
        configured={hasSupabaseEnv()}
      />
    </AppShell>
  );
}
