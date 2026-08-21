/**
 * Bracket product eligibility — mirrors SQL is_bracket_product().
 */
export const PUBLIC_TIERS = [
  "grand_slam",
  "tour_finals",
  "masters_1000",
  "tour_500",
  "tour_250",
] as const;

export type PublicTier = (typeof PUBLIC_TIERS)[number];

export type TournamentTier =
  | PublicTier
  | "challenger"
  | "wta_125"
  | "itf"
  | "other";

export function isBracketProduct(
  tour: string | null | undefined,
  tier: string | null | undefined,
  override: "force_on" | "force_off" | null | undefined = null
): boolean {
  if (override === "force_on") return true;
  if (override === "force_off") return false;
  if (tour !== "atp" && tour !== "wta") return false;
  return (PUBLIC_TIERS as readonly string[]).includes(tier || "other");
}
