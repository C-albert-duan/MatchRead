const { withSentryConfig } = require("@sentry/nextjs/config");

// A local live-client run sets these so Next does not keep the hosted URL from .env.local.
if (process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.E2E_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
  if (process.env.E2E_SITE_URL) process.env.NEXT_PUBLIC_SITE_URL = process.env.E2E_SITE_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.E2E_SUPABASE_URL ? ".next-e2e" : ".next",
  // Keep packages as plain TS sources; Next 14 transpiles workspace pkgs via this.
  transpilePackages: ["@matchread/core", "@matchread/tokens", "@matchread/i18n"],
  // Required for the production Docker image (see root Dockerfile).
  output: "standalone",
  async redirects() {
    return [
      { source: "/showcase", destination: "/tournaments", permanent: true },
    ];
  },
};

const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
);

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: uploadSourceMaps ? false : "disable-upload",
  },
});
