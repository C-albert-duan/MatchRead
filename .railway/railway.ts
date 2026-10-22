import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * One listener container. A second replica duplicates provider traffic.
 * Ingest dedupes that traffic. This file does not elect a leader.
 *
 * New Railway services read this file. They do not read railway.json.
 * Apply with the Railway CLI. This repository does not apply it.
 * `/health` must return 200 before Railway keeps the new deployment.
 * Preserved variables are deployment secrets. This file does not hold their values.
 */
export const partial = "listener";

export default defineRailway(() => {
  const listener = service("listener", {
    source: github("C-albert-duan/MatchRead", { branch: "main" }),
    replicas: 1,
    start: "npm run start -w @matchread/listener",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    env: {
      RAILWAY_DOCKERFILE_PATH: "apps/listener/Dockerfile",
      NODE_ENV: "production",
      PORT: "8080",
      RAPIDAPI_KEY: preserve(),
      RAPIDAPI_HOST: preserve(),
      MATCHREAD_INGEST_URL: preserve(),
      INGEST_SECRET: preserve(),
      LISTENER_POLL_MS: preserve(),
    },
  });

  return project("matchread", {
    resources: [listener],
  });
});
