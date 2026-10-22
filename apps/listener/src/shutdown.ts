/**
 * Railway sends SIGTERM before it stops the container.
 * The wait ends when that signal arrives, so a poll sleep does not run out the grace period.
 */

/** Final heartbeat does not hold the process past the container grace period. */
export const SHUTDOWN_HEARTBEAT_MS = 2_000;

export type ShutdownGate = {
  requested: () => boolean;
  request: () => void;
  listen: (onRequest?: () => void) => () => void;
  sleep: (ms: number) => Promise<void>;
};

export function createShutdown(): ShutdownGate {
  let stopped = false;
  const wake: Array<() => void> = [];

  function request() {
    if (stopped) return;
    stopped = true;
    const pending = wake.splice(0);
    for (const resume of pending) resume();
  }

  return {
    requested: () => stopped,
    request,
    listen(onRequest) {
      const onSignal = () => {
        onRequest?.();
        request();
      };
      process.on("SIGTERM", onSignal);
      process.on("SIGINT", onSignal);
      return () => {
        process.off("SIGTERM", onSignal);
        process.off("SIGINT", onSignal);
      };
    },
    sleep(ms: number) {
      if (stopped || ms <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(finish, ms);
        function finish() {
          clearTimeout(timer);
          const index = wake.indexOf(finish);
          if (index >= 0) wake.splice(index, 1);
          resolve();
        }
        wake.push(finish);
      });
    },
  };
}
