import { t } from "@/lib/i18n";

const SURFACES = ["hard", "clay", "grass", "indoor"] as const;

const SURFACE_KEYS = {
  hard: "surface.hard",
  clay: "surface.clay",
  grass: "surface.grass",
  indoor: "surface.indoor",
} as const;

export function SurfaceKey() {
  return (
    <ul className="surface-key" aria-label={t("calendar.surfaceKey")}>
      {SURFACES.map((surface) => (
        <li key={surface} className="surf" data-s={surface}>
          <i aria-hidden />
          {t(SURFACE_KEYS[surface])}
        </li>
      ))}
    </ul>
  );
}
