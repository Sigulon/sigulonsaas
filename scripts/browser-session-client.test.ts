import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// A small hook harness drives the actual component callbacks without a DOM or
// media device. Network, Room and microphone boundaries remain controllable.
const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[], states: [] as { value: unknown }[],
  mic: { stop: vi.fn(), isMuted: false, mute: vi.fn(), unmute: vi.fn() },
  createMic: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), publish: vi.fn(),
  events: new Map<string, (...args: unknown[]) => void>(),
  streams: new Map<string, (...args: unknown[]) => Promise<void>>(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const state = { value: initial }; harness.states.push(state);
    return [initial, (next: unknown) => { state.value = typeof next === "function" ? next(state.value) : next; }];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup); },
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/badge", () => ({ Badge: "span" }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("lucide-react", () => ({ PhoneCall: "i", PhoneOff: "i", Mic: "i", MicOff: "i", Volume2: "i", Loader2: "i" }));
vi.mock("livekit-client", () => ({
  createLocalAudioTrack: harness.createMic,
  Track: { Kind: { Audio: "audio" } },
  RoomEvent: Object.fromEntries(["TrackSubscribed", "TrackUnsubscribed", "AudioPlaybackStatusChanged", "TranscriptionReceived", "ParticipantAttributesChanged", "ParticipantDisconnected", "Reconnecting", "Reconnected", "Disconnected", "MediaDevicesError"].map((key) => [key, key])),
  Room: class {
    localParticipant = { identity: "local", publishTrack: harness.publish };
    remoteParticipants = new Map();
    connect = harness.connect; disconnect = harness.disconnect;
    startAudio = async () => {};
    on(event: string, callback: (...args: unknown[]) => void) { harness.events.set(event, callback); }
    registerTextStreamHandler(topic: string, callback: (...args: unknown[]) => Promise<void>) { harness.streams.set(topic, callback); }
    unregisterTextStreamHandler(topic: string) { harness.streams.delete(topic); }
    removeAllListeners() { harness.events.clear(); }
  },
}));
import { BrowserCallPlayground, resolveSpeechLanguageCode } from "../src/components/builder/browser-call-playground";

function findStart(node: ReactNode): (() => Promise<void>) | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map(findStart).find(Boolean);
  const element = node as ReactElement<{ onClick?: () => Promise<void>; children?: ReactNode }>;
  if (element.type === "button") return element.props.onClick;
  return findStart(element.props?.children);
}
function render() {
  return findStart(BrowserCallPlayground({ agentId: "agent", agentName: "Test", language: "en", voiceName: "Voice" }))!;
}
function unmount() { harness.cleanups.splice(0).forEach((cleanup) => cleanup()); }
const initResponse = () => Response.json({ callId: "call", livekitUrl: "wss://test.invalid", livekitToken: "token" });
beforeEach(() => {
  vi.clearAllMocks(); harness.states = []; harness.events.clear(); harness.streams.clear();
  harness.createMic.mockResolvedValue(harness.mic);
  harness.connect.mockResolvedValue(undefined); harness.publish.mockResolvedValue(undefined); harness.disconnect.mockResolvedValue(undefined);
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

test("mic denial never allocates a server room", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  harness.createMic.mockRejectedValueOnce(new Error("Microphone denied"));
  await render()();
  expect(fetcher).not.toHaveBeenCalled();
  expect(harness.disconnect).toHaveBeenCalled();
  expect(harness.states[1].value).toBe("idle");
});
test("Hinglish and UK English retain their configured speech language", () => {
  expect(resolveSpeechLanguageCode("hinglish")).toBe("hinglish");
  expect(resolveSpeechLanguageCode("hi-en")).toBe("hinglish");
  expect(resolveSpeechLanguageCode("en-GB")).toBe("en-GB");
});
test("cancellation during init locks out a second call until the late room is closed", async () => {
  let resolveInit!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveInit = resolve; })).mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetcher);
  const start = render(); const starting = start();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  harness.events.get("Disconnected")!();
  await start();
  expect(fetcher).toHaveBeenCalledTimes(1);
  resolveInit(initResponse()); await starting;
  await vi.waitFor(() => expect(harness.states[1].value).toBe("idle"));
  expect(harness.connect).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test("local disconnect failure still attempts authenticated server cleanup", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(initResponse()).mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetcher);
  harness.connect.mockRejectedValueOnce(new Error("Connection failed"));
  harness.disconnect.mockRejectedValueOnce(new Error("Local disconnect failed"));
  await render()();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(harness.states[1].value).toBe("cleanup");
});
test("unmount during init consumes the late call ID and closes it without connecting", async () => {
  let resolveInit!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveInit = resolve; })).mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetcher);
  const starting = render()();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  unmount(); resolveInit(initResponse()); await starting;
  expect(harness.connect).not.toHaveBeenCalled();
  expect(harness.mic.stop).toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "end_call", callId: "call" });
});
test("connection failure closes the server room and releases microphone", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(initResponse()).mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetcher); harness.connect.mockRejectedValueOnce(new Error("Connection failed"));
  await render()();
  expect(harness.mic.stop).toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(harness.states[1].value).toBe("idle");
});
test("transcription events update segments and text streams classify local versus agent", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(initResponse()).mockResolvedValue(Response.json({ success: true })));
  await render()();
  const received = harness.events.get("TranscriptionReceived")!;
  received([{ id: "segment", text: "hel", final: false }], { identity: "local" });
  received([{ id: "segment", text: "hello", final: true }], { identity: "local" });
  const reader = { info: { id: "stream", attributes: { "lk.segment_id": "reply" } },
    async *[Symbol.asyncIterator]() { yield "Hi "; yield "there"; } };
  await harness.streams.get("lk.transcription")!(reader, { identity: "agent" });
  expect(harness.states[5].value).toEqual([
    { id: "local:segment", role: "user", content: "hello", final: true },
    { id: "agent:reply", role: "assistant", content: "Hi there", final: true },
  ]);
  expect(harness.publish).toHaveBeenCalledWith(harness.mic);
});
