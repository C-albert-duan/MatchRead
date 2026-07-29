/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep packages as plain TS sources; Next 14 transpiles workspace pkgs via this.
  transpilePackages: ["@matchread/core", "@matchread/tokens", "@matchread/i18n"],
};

module.exports = nextConfig;
