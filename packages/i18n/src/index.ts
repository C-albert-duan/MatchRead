export type Locale = "en" | "es" | "ja";

export const defaultLocale: Locale = "en";

const en = {
  "landing.eyebrow": "MatchRead",
  "landing.title": "Read the match. Keep the league.",
  "landing.lede":
    "Fill tournament brackets with your group. Not gambling — just better tennis reads, and a Daily Check worth opening.",
  "nav.leagues": "Leagues",
  "nav.signIn": "Sign in",
  "cta.startLeague": "Start a league",
} as const;

export type MessageKey = keyof typeof en;

const catalogues: Record<Locale, Record<MessageKey, string>> = {
  en,
  es: { ...en }, // placeholders until Phase 07
  ja: { ...en },
};

export function t(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key] ?? catalogues.en[key];
}
