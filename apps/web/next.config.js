const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
