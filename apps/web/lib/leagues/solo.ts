/** Solo funnel presentation: personal league of one, or graduated flag still alone. */
export function isSoloPresentation(input: {
  is_solo?: boolean | null;
  member_count: number;
}): boolean {
  return Boolean(input.is_solo) || input.member_count < 2;
}
