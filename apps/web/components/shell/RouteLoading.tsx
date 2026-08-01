import { PageSkeleton } from "@/components/shell/PageSkeleton";
import { t } from "@/lib/i18n";

/** Loading UI that keeps MatchRead chrome so nav doesn't flash away. */
export function RouteLoading() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <span className="wordmark">MatchRead</span>
        </div>
      </header>
      <main className="shell-main">
        <PageSkeleton label={t("nav.loading")} />
      </main>
    </div>
  );
}
