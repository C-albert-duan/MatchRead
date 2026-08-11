/** Design tokens — MatchRead club system.
 * White is the room. Charcoal is type and the only primary button.
 * Tournament Green is identity and verified fact — never a button.
 * Ball yellow is live energy, rare. Court colours are surface facts only.
 * Elevation is canvas / raised / sunken + hairlines. No shadows.
 */

export const color = {
  canvas: "#FFFFFF",
  raised: "#F2F5F4",
  sunken: "#FAFBFB",
  input: "#FFFFFF",
  line: "#E2E7E6",
  lineStrong: "#C9D1CF",
  lineControl: "#828E8B",
  textPrimary: "#15181B",
  textSecondary: "#3B4248",
  textMuted: "#626A72",
  /** Charcoal inverse panels (close band, settled artifact). */
  inverse: "#15181B",
  inverseText: "#FFFFFF",
  /** A user's pick — ink, not celebration. */
  read: "#15181B",
  readStrong: "#3B4248",
  /** Primary action. Charcoal, never green, never a court colour. */
  accent: "#15181B",
  accentStrong: "#3B4248",
  /** Verified tournament fact. */
  data: "#0A6B42",
  dataStrong: "#053D26",
  dataTint: "#EDF4F0",
  wta: "#C6A2FF",
  miss: "#C93F36",
  missStrong: "#A3322B",
  /** Tennis energy. Live play and the Daily Check marker. Never text on white. */
  ball: "#D9F35A",
  ballEdge: "#C4DE3F",
  courtClay: "#C2633C",
  courtGrass: "#5F8F3A",
  courtHard: "#2F6FA8",
  courtIndoor: "#293D5E",
  /** Inverse charcoal — one moment per view, not page ground. */
  scoreboard: "#15181B",
  scoreboardRaised: "#1C2126",
} as const;

export const font = {
  display: "var(--font-archivo), Archivo, ui-sans-serif, system-ui, sans-serif",
  body: 'var(--font-instrument), "Instrument Sans", ui-sans-serif, system-ui, sans-serif',
  numeral: 'var(--font-plex), "IBM Plex Mono", ui-monospace, monospace',
} as const;

export const spacing = {
  none: "0px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "56px",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  pill: "999px",
} as const;

export const layout = {
  page: "1220px",
  gutter: "clamp(20px, 4.4vw, 56px)",
  section: "clamp(80px, 10vw, 136px)",
  cardPad: "clamp(24px, 2.4vw, 34px)",
  touch: "48px",
  header: "80px",
} as const;

export const motion = {
  instant: "120ms",
  base: "220ms",
  enter: "250ms",
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
  easeDecel: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export function cssVariables(): string {
  return [
    `--mr-canvas: ${color.canvas}`,
    `--mr-raised: ${color.raised}`,
    `--mr-sunken: ${color.sunken}`,
    `--mr-input: ${color.input}`,
    `--mr-line: ${color.line}`,
    `--mr-line-strong: ${color.lineStrong}`,
    `--mr-line-control: ${color.lineControl}`,
    `--mr-text-primary: ${color.textPrimary}`,
    `--mr-text-secondary: ${color.textSecondary}`,
    `--mr-text-muted: ${color.textMuted}`,
    `--mr-inverse: ${color.inverse}`,
    `--mr-inverse-text: ${color.inverseText}`,
    `--mr-read: ${color.read}`,
    `--mr-read-strong: ${color.readStrong}`,
    `--mr-accent: ${color.accent}`,
    `--mr-accent-strong: ${color.accentStrong}`,
    `--mr-data: ${color.data}`,
    `--mr-data-strong: ${color.dataStrong}`,
    `--mr-data-tint: ${color.dataTint}`,
    `--mr-green-tint: ${color.dataTint}`,
    `--mr-green-deep: ${color.dataStrong}`,
    `--mr-wta: ${color.wta}`,
    `--mr-miss: ${color.miss}`,
    `--mr-miss-strong: ${color.missStrong}`,
    `--mr-ball: ${color.ball}`,
    `--mr-ball-edge: ${color.ballEdge}`,
    `--mr-court-clay: ${color.courtClay}`,
    `--mr-court-grass: ${color.courtGrass}`,
    `--mr-court-hard: ${color.courtHard}`,
    `--mr-court-indoor: ${color.courtIndoor}`,
    `--mr-scoreboard: ${color.scoreboard}`,
    `--mr-scoreboard-raised: ${color.scoreboardRaised}`,
    `--mr-font-display: ${font.display}`,
    `--mr-font-body: ${font.body}`,
    `--mr-font-numeral: ${font.numeral}`,
    `--mr-duration-instant: ${motion.instant}`,
    `--mr-duration-base: ${motion.base}`,
    `--mr-duration-enter: ${motion.enter}`,
    `--mr-ease-standard: ${motion.ease}`,
    `--mr-ease-decel: ${motion.easeDecel}`,
    `--s-none: ${spacing.none}`,
    `--s-xs: ${spacing.xs}`,
    `--s-sm: ${spacing.sm}`,
    `--s-md: ${spacing.md}`,
    `--s-lg: ${spacing.lg}`,
    `--s-xl: ${spacing.xl}`,
    `--s-2xl: ${spacing["2xl"]}`,
    `--s-3xl: ${spacing["3xl"]}`,
    `--s-4xl: ${spacing["4xl"]}`,
    `--s-5xl: ${spacing["5xl"]}`,
    `--r-sm: ${radius.sm}`,
    `--r-md: ${radius.md}`,
    `--r-lg: ${radius.lg}`,
    `--r-xl: ${radius.xl}`,
    `--r-pill: ${radius.pill}`,
    `--max-prose: 40rem`,
    `--max-content: ${layout.page}`,
    `--page-gutter: ${layout.gutter}`,
    `--section: ${layout.section}`,
    `--card-pad: ${layout.cardPad}`,
    `--touch: ${layout.touch}`,
    `--header-h: ${layout.header}`,
  ].join(";\n  ");
}

/** CSS text for `:root` — the only place hex values should enter the stylesheet. */
export function rootStyle(): string {
  return `:root {\n  ${cssVariables()}\n}`;
}
