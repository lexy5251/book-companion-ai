import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // epub2 does dynamic requires + reads files relative to its own location,
  // which breaks when bundled. Load it as a normal Node dependency instead.
  serverExternalPackages: ["epub2"],
};

export default nextConfig;
