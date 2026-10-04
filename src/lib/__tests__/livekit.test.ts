import { describe, expect, it } from "vitest";
import {
  buildDispatchMetadata,
  parseDispatchMetadata,
  roomNameForCall,
} from "../livekit";

describe("dispatch metadata", () => {
  it("round-trips org/agent/direction", () => {
    const raw = buildDispatchMetadata({ orgId: "o1", agentId: "a1", direction: "outbound", callId: "c1" });
    const parsed = parseDispatchMetadata(raw);
    expect(parsed).toMatchObject({ orgId: "o1", agentId: "a1", direction: "outbound", callId: "c1" });
  });

  it("rejects garbage without throwing", () => {
    expect(parseDispatchMetadata("not-json")).toBeNull();
    expect(parseDispatchMetadata(null)).toBeNull();
    expect(parseDispatchMetadata('{"orgId":"o"}')).toBeNull();
  });
});

describe("room naming", () => {
  it("maps 1:1 to session key input", () => {
    expect(roomNameForCall("abc")).toBe("sigulon-call-abc");
  });
});
