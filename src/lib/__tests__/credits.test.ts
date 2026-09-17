import { describe, expect, it } from "vitest";
import {
  computeUsageCredits,
  getCreditState,
  refundKey,
  reserveCallCredits,
  reserveEstimateCredits,
  reserveKey,
  settleCallCredits,
  settleKey,
  sumUsage,
  toLedgerView,
} from "../credits";

describe("computeUsageCredits", () => {
  it("bills per started minute at 0.25 cr/min, minimum one minute", () => {
    expect(computeUsageCredits(0)).toBe(0.25);
    expect(computeUsageCredits(48)).toBe(0.25);
    expect(computeUsageCredits(60)).toBe(0.25);
    expect(computeUsageCredits(61)).toBe(0.5);
    expect(computeUsageCredits(115)).toBe(0.5);
  });

  it("holds a 20-minute estimate by default", () => {
    expect(reserveEstimateCredits()).toBe(5);
  });
});

describe("idempotency keys", () => {
  it("namespace per call and op", () => {
    expect(reserveKey("c1")).toBe("reserve:c1");
    expect(settleKey("c1")).toBe("settle:c1");
    expect(refundKey("c1")).toBe("refund:c1");
  });
});

describe("RPC wrappers", () => {
  const rpc = (data: unknown) => ({
    rpc: async () => ({ data, error: null }),
  });

  it("parses numeric-as-string balances", async () => {
    const state = await getCreditState(
      rpc([{ balance_credits: "100.50", reserved_credits: "5.00" }]),
      "o1"
    );
    expect(state).toEqual({ balance: 100.5, reserved: 5, available: 100.5 });
  });

  it("shapes reserve results", async () => {
    const res = await reserveCallCredits(
      rpc([
        {
          reserved: true,
          insufficient: false,
          balance_credits: 95,
          reserved_credits: 5,
        },
      ]),
      "o1",
      "c1"
    );
    expect(res.did_reserve).toBe(true);
    expect(res.insufficient).toBe(false);
    expect(res.available).toBe(95);
  });

  it("shapes settle results", async () => {
    const res = await settleCallCredits(
      rpc([
        {
          settled: true,
          usage_credits: "0.50",
          refunded_credits: "4.50",
          balance_credits: 99.5,
          reserved_credits: 0,
        },
      ]),
      "o1",
      "c1",
      0.5
    );
    expect(res.settled).toBe(true);
    expect(res.usage).toBe(0.5);
    expect(res.refunded).toBe(4.5);
  });

  it("surfaces RPC errors", async () => {
    const bad = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    await expect(getCreditState(bad, "o1")).rejects.toThrow("boom");
  });
});

describe("toLedgerView / sumUsage", () => {
  it("labels events and keeps signed amounts", () => {
    const view = toLedgerView([
      {
        id: "1",
        created_at: "2026-09-10T00:00:00Z",
        event: "call_usage",
        amount_credits: "-0.50",
        call_id: "c1",
      },
      {
        id: "2",
        created_at: "2026-09-10T00:01:00Z",
        event: "call_refund",
        amount_credits: 4.5,
        call_id: "c1",
      },
      {
        id: "3",
        created_at: "2026-09-10T00:02:00Z",
        event: "mystery",
        amount_credits: 1,
        call_id: null,
      },
    ]);
    expect(view[0]).toMatchObject({ label: "Call usage", amount: -0.5 });
    expect(view[1]).toMatchObject({ label: "Hold released", amount: 4.5 });
    expect(view[2].label).toBe("mystery");
  });

  it("spends only usage debits, by absolute value", () => {
    expect(
      sumUsage([
        { event: "call_usage", amount_credits: "-0.50" },
        { event: "call_usage", amount_credits: -0.25 },
        { event: "call_refund", amount_credits: 4.5 },
        { event: "call_reservation", amount_credits: 5 },
      ])
    ).toBe(0.75);
  });
});
