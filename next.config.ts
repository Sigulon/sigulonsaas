import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OpenNext owns the Workers bundle. Do not use Next's standalone output;
  // it produces a Node server image rather than a Worker entrypoint.
};

export default nextConfig;

// Make `next dev` use the same binding-aware adapter used by Wrangler preview.
// The import is intentionally kept after the config export as recommended by
// OpenNext so normal Next development remains available.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
