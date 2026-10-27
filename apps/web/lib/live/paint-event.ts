/** Fired on window when the live layer paints or clears a cell. */
export const LIVE_PAINT_EVENT = "mr:live-paint";

export type LivePaintDetail = {
  ref: string;
  live: boolean;
  sets: string | null;
  game: string | null;
};
