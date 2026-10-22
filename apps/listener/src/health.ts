/**
 * Process health for the listener container.
 * The body is a status word. It does not include a key, a token, or a secret.
 */
import { createServer, type Server } from "node:http";
import { STALE_AFTER_MS, isProviderStale } from "@matchread/provider-rapidapi";

export type ListenerHealthState = {
  draining: boolean;
  attempts: number;
  lastSuccessAt: number | null;
};

export type HealthBody = { status: "ok" | "starting" | "stale" | "draining" };

const DEFAULT_PORT = 8080;

export function healthPort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.PORT);
  if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  return DEFAULT_PORT;
}

/** Starting is not ready. A read inside the stale window is ok. Shutdown and a quiet provider are not. */
export function listenerHealthResponse(
  state: ListenerHealthState,
  now: number,
  staleAfterMs = STALE_AFTER_MS
): { status: number; body: HealthBody } {
  if (state.draining) return { status: 503, body: { status: "draining" } };
  if (state.attempts === 0) return { status: 503, body: { status: "starting" } };
  if (isProviderStale(state.lastSuccessAt, now, staleAfterMs)) {
    return { status: 503, body: { status: "stale" } };
  }
  return { status: 200, body: { status: "ok" } };
}

export type HealthServer = {
  port: number;
  close: () => Promise<void>;
};

export function startListenerHealth(
  state: ListenerHealthState,
  port: number
): Promise<HealthServer> {
  const server = createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0];
    if (request.method !== "GET" || path !== "/health") {
      response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "not_found" }));
      return;
    }
    const result = listenerHealthResponse(state, Date.now());
    response.writeHead(result.status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(result.body));
  });
  return listen(server, port);
}

function listen(server: Server, port: number): Promise<HealthServer> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      const address = server.address();
      const bound = address && typeof address === "object" ? address.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
