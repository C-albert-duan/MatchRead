import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CreateLeagueForm } from "@/components/CreateLeagueForm";
import { getSessionUser } from "@/lib/auth";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues%2Fnew");
  }

  return (
    <AppShell signedIn email={user.email}>
      <CreateLeagueForm />
    </AppShell>
  );
}
