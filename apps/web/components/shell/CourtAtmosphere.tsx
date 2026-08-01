/** Pure CSS geometric hard-court — no photos, no collage. */
export function CourtAtmosphere() {
  return (
    <div className="court-atmosphere" aria-hidden="true">
      <div className="court-atmosphere-wash" />
      <div className="court-atmosphere-grid" />
      <div className="court-atmosphere-lines" />
      <div className="court-atmosphere-orb court-atmosphere-orb--a" />
      <div className="court-atmosphere-orb court-atmosphere-orb--b" />
    </div>
  );
}
