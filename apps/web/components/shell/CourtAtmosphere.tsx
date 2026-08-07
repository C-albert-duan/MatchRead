/** Soft tennis-court photo atmosphere + motion layers across every page. */
export function CourtAtmosphere() {
  return (
    <div className="court-atmosphere" aria-hidden="true">
      <div className="court-atmosphere-photo court-atmosphere-photo--hard" />
      <div className="court-atmosphere-photo court-atmosphere-photo--clay" />
      <div className="court-atmosphere-photo court-atmosphere-photo--grass" />
      <div className="court-atmosphere-motion" />
      <div className="court-atmosphere-wash" />
      <div className="court-atmosphere-vignette" />
      <div className="court-atmosphere-grid" />
      <div className="court-atmosphere-lines" />
      <div className="court-atmosphere-orb court-atmosphere-orb--a" />
      <div className="court-atmosphere-orb court-atmosphere-orb--b" />
    </div>
  );
}
