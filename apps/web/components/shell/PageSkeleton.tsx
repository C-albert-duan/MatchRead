type Props = {
  label?: string;
};

/** Shared route loading UI — used by loading.tsx segment files. */
export function PageSkeleton({ label = "Loading…" }: Props) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true">
      <p className="page-skeleton-label">{label}</p>
      <div className="page-skeleton-block page-skeleton-block--title" />
      <div className="page-skeleton-block page-skeleton-block--lead" />
      <div className="page-skeleton-block page-skeleton-block--body" />
      <div className="page-skeleton-block page-skeleton-block--body" />
      <div className="page-skeleton-block page-skeleton-block--panel" />
    </div>
  );
}
