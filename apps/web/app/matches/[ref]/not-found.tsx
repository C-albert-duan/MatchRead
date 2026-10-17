import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { t } from "@/lib/i18n";

export default function MatchNotFound() {
  return (
    <AppShell signedIn={false}>
      <div className="stack gap-2xl" style={{ maxWidth: 520 }}>
        <div className="stack gap-lg">
          <p className="eyebrow">{t("match.notFound.eyebrow")}</p>
          <h1 className="t-page-title">{t("match.notFound.title")}</h1>
          <p className="t-lead">{t("match.notFound.body")}</p>
        </div>
        <Link href="/tournaments" className="act act--standard act--standard-size">
          {t("nav.calendar")}
        </Link>
      </div>
    </AppShell>
  );
}
