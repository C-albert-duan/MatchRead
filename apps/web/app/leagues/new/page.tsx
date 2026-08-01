import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CreateLeagueForm } from "@/components/league/CreateLeagueForm";
import { getSessionUser } from "@/lib/auth";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues%2Fnew");
  }

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <CreateLeagueForm />
      </div>
    </AppShell>
  );
}
