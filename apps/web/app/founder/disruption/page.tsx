import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DisruptionForm } from "@/components/founder/DisruptionForm";
import { ErrorNote } from "@/components/shell/ErrorNote";
import { getSessionUser } from "@/lib/auth";
import {
  founderEmailsUnset,
  isFounderEmail,
} from "@/lib/auth/founder";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function DisruptionPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Ffounder%2Fdisruption");
  }

  if (!isFounderEmail(user.email ?? undefined)) {
    return (
      <AppShell signedIn email={user.email}>
        <div className="stack gap-lg">
          <p className="eyebrow">{t("disruption.eyebrow")}</p>
          <h1 className="t-page-title">{t("disruption.title")}</h1>
          <ErrorNote>{t("founder.denied")}</ErrorNote>
        </div>
      </AppShell>
    );
  }

  const supabase = createClient();
  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select("id, slug, name")
    .order("starts_on", { ascending: true });

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl">
        {founderEmailsUnset() ? (
          <div className="status-banner status-banner--beta" role="status">
            {t("founder.beta")}
          </div>
        ) : null}

        <div className="stack gap-lg">
          <p className="eyebrow">{t("disruption.eyebrow")}</p>
          <h1 className="t-page-title">{t("disruption.title")}</h1>
          <p className="t-lead">{t("disruption.lede")}</p>
        </div>

        {error ? (
          <ErrorNote>
            {t("error.generic")}{" "}
            <span className="t-caption">{error.message}</span>
          </ErrorNote>
        ) : null}

        {!error && (tournaments ?? []).length === 0 ? (
          <p className="stub-note">
            No tournaments yet. Sync calendar / publish an official draw.
          </p>
        ) : null}

        <DisruptionForm
          tournaments={(tournaments ?? []).map((row) => ({
            id: row.id,
            ref: row.slug,
            name: row.name,
          }))}
          preview={t("disruption.preview")}
          submitLabel={t("disruption.submit")}
          submittingLabel={t("disruption.submitting")}
          afterMessage={t("disruption.after")}
        />

        <p className="hint">{t("founder.note.noServiceRole")}</p>

        <Link href="/founder" className="act act--standard act--standard-size">
          ← {t("founder.title")}
        </Link>
      </div>
    </AppShell>
  );
}
