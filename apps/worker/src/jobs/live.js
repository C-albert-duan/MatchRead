/**
 * Mega Socket.IO live feed. Scores / finished status only — odds ignored.
 * If the token or socket client is unavailable, the REST reconcile tick still runs.
 */
import { createClient, getWsToken } from "@matchread/provider-rapidapi";
import { reconcileResults } from "./reconcile.js";

const SOCKET_URL = "https://live.matchstat.com";

function finishedCount(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.filter((row) =>
    /^(finished|ended|complete|completed)$/i.test(String(row?.status || ""))
  ).length;
}

export async function startLiveSocket(env, { dryRun = false } = {}) {
  const client = createClient({
    key: env.RAPIDAPI_KEY,
    host: env.RAPIDAPI_HOST,
  });
  let token = null;
  try {
    const got = await getWsToken(client);
    token = got.token;
  } catch (err) {
    console.warn("live socket token:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "ws-token failed" };
  }
  if (!token) return { ok: false, reason: "no ws-token" };

  let io;
  try {
    ({ io } = await import("socket.io-client"));
  } catch {
    console.warn("live socket: socket.io-client not installed — REST poll only");
    return { ok: false, reason: "no socket.io-client" };
  }

  const socket = io(SOCKET_URL, {
    auth: { token, apiKey: token },
    transports: ["websocket"],
    reconnection: true,
  });

  let debounce = null;
  const kickReconcile = () => {
    if (debounce) return;
    debounce = setTimeout(() => {
      debounce = null;
      reconcileResults(env, { dryRun }).catch((err) =>
        console.error("live reconcile", err instanceof Error ? err.message : err)
      );
    }, 1500);
  };

  socket.on("connect", () => {
    console.log("live socket connected");
    socket.emit("join-live-events-all", "tennis");
  });
  socket.on("connect_error", (err) => {
    console.warn("live socket connect_error", err?.message || err);
  });
  socket.on("live-events-all-update", (payload) => {
    if (finishedCount(payload) > 0) kickReconcile();
  });
  socket.on("event-update", (payload) => {
    if (finishedCount([payload]) > 0) kickReconcile();
  });

  return {
    ok: true,
    stop: () => {
      if (debounce) clearTimeout(debounce);
      socket.emit("leave-live-events-all", "tennis");
      socket.close();
    },
  };
}
