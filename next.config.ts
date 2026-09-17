import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host image (`Dockerfile`) runs the standalone server. Vercel
  // ignores this harmlessly — the primary web target is unchanged.
  output: "standalone",
};

export default nextConfig;
