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

module.exports = nextConfig;
