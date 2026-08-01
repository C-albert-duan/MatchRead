import { Suspense } from "react";
import { NavigationProgress } from "@/components/shell/NavigationProgress";
import { t } from "@/lib/i18n";

/** Suspense boundary required for useSearchParams in App Router. */
export function NavigationProgressHost() {
  return (
    <Suspense fallback={null}>
      <NavigationProgress label={t("nav.loading")} />
    </Suspense>
  );
}
