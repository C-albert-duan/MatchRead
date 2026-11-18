// draw_size written by the calendar sync (fix list P1-8).
// Pure: no Deno or Supabase imports, so Node tests can load it.
//
// The calendar only has a rough guess (128 for any Masters, 32 for a
// 250/500). The official sheet sets the real size, and changing it after
// publish makes the draw unofficial and reopens picks. So the guess only
// fills a row that has no size yet and no published draw.
//
// Every row sent in one bulk upsert must carry draw_size: PostgREST fills a
// column missing from some rows with null, which would wipe a known size.

export type ExistingDrawRow = {
  draw_size: number | null;
  published_at: string | null;
} | undefined;

export function calendarDrawSize(
  existing: ExistingDrawRow,
  hint: number | null | undefined
): number | null {
  if (existing) {
    if (existing.draw_size != null) return existing.draw_size;
    if (existing.published_at) return null;
  }
  return hint ?? null;
}
