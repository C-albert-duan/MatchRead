import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { WelcomeNameForm } from "@/components/auth/WelcomeNameForm";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: { next?: string };
};

export default async function WelcomePage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/welcome${searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : ""}`
      )}`
    );
  }

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <WelcomeNameForm
          nextParam={searchParams.next ?? "/leagues"}
          initialName={profile?.display_name ?? null}
        />
      </div>
    </AppShell>
  );
}
