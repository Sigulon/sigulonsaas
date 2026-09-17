import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_QUEUE_KEY,
  CAMPAIGN_RETRY_ZSET,
  dispatchLockKey,
} from "../campaign-queue";

describe("campaign queue keys", () => {
  it("uses the worker-mirrored key layout", () => {
    // services/campaign-worker/queueing.py must use these exact strings.
    expect(CAMPAIGN_QUEUE_KEY).toBe("sigulon:campaign:queue");
    expect(CAMPAIGN_RETRY_ZSET).toBe("sigulon:campaign:retries");
    expect(dispatchLockKey("c1")).toBe("sigulon:campaign:c1:dispatch_lock");
  });
});
