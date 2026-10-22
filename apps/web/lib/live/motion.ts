/**
 * Whether the live indicator may animate.
 * A hidden tab stops it. A match that is no longer live does not restart it.
 * Reduced motion stops it. This is not a motion system.
 */
export function liveIndicatorMotion(input: {
  hidden: boolean;
  live: boolean;
  reducedMotion: boolean;
}): "run" | "stop" {
  if (input.reducedMotion || input.hidden || !input.live) return "stop";
  return "run";
}
