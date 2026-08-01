/** Client-only signal so Back / programmatic navigations share the progress UI. */
export const NAV_START_EVENT = "mr:navstart";

export function signalNavigationStart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAV_START_EVENT));
}
