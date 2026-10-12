import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Incremental-cache R2 is deliberately not wired to the recordings bucket.
// Add NEXT_INC_CACHE_R2_BUCKET only after a separate cache bucket exists.
export default defineCloudflareConfig({});
