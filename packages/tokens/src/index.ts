/** Design tokens — MatchRead night-court editorial.
 * Primary CTA = hard-court blue (action). Green = verified data only.
 * Canvas is scoreboard-adjacent navy; elevation via hairlines, not shadows.
 */

export const color = {
  canvas: "#07141F",
  raised: "#0E2436",
  sunken: "#0A1A28",
  input: "#0C1E2E",
  line: "#243B50",
  lineStrong: "#3A5A75",
  lineControl: "#5A8AB0",
  textPrimary: "#F0F6FA",
  textSecondary: "#B4C8D8",
  textMuted: "#7A94A8",
  inverse: "#F0F6FA",
  inverseText: "#07141F",
  read: "#F0F6FA",
  readStrong: "#B4C8D8",
  /** Action / live energy — not a verified result */
  accent: "#00A6EF",
  accentStrong: "#5AD0FF",
  data: "#2DCF7A",
  dataStrong: "#1FAA5C",
  wta: "#C6A2FF",
  miss: "#E0453A",
  missStrong: "#B8322A",
  courtClay: "#D96B3C",
  courtGrass: "#4FA03A",
  courtHard: "#00A6EF",
  courtIndoor: "#1A3554",
  scoreboard: "#050E16",
  scoreboardRaised: "#0C2030",
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
    `--mr-wta: ${color.wta}`,
    `--mr-miss: ${color.miss}`,
    `--mr-miss-strong: ${color.missStrong}`,
    `--mr-court-clay: ${color.courtClay}`,
    `--mr-court-grass: ${color.courtGrass}`,
    `--mr-court-hard: ${color.courtHard}`,
    `--mr-court-indoor: ${color.courtIndoor}`,
    `--mr-scoreboard: ${color.scoreboard}`,
    `--mr-scoreboard-raised: ${color.scoreboardRaised}`,
    `--mr-font-display: ${font.display}`,
    `--mr-font-body: ${font.body}`,
    `--mr-font-numeral: ${font.numeral}`,
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
  ].join(";\n  ");
}
