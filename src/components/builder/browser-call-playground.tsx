"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Room, RoomEvent, Track, createLocalAudioTrack, type LocalAudioTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PhoneCall, PhoneOff, Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import type { AgentBundle } from "@/lib/agent-bundle/schema";

export const SUPPORTED_STT_LANGUAGES = [
  { code: "te-IN", label: "Telugu (తెలుగు)" },
  { code: "hi-IN", label: "Hindi (हिन्दी)" },
  { code: "hinglish", label: "Hinglish (Hindi + English)" },
  { code: "en-IN", label: "English (India)" },
  { code: "ta-IN", label: "Tamil (தமிழ்)" },
  { code: "kn-IN", label: "Kannada (ಕನ್ನಡ)" },
  { code: "mr-IN", label: "Marathi (मराठी)" },
  { code: "bn-IN", label: "Bengali (বাংলা)" },
  { code: "gu-IN", label: "Gujarati (ગુજરાતી)" },
  { code: "ml-IN", label: "Malayalam (മലയാളം)" },
  { code: "pa-IN", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
] as const;

export function resolveSpeechLanguageCode(lang?: string): string {
  const clean = (lang || "").toLowerCase().trim();
  if (["hinglish", "hing", "hi-en", "en-hi"].includes(clean)) return "hinglish";
  if (clean.startsWith("en-us") || clean === "us") return "en-US";
  if (clean.startsWith("en-gb") || clean === "uk") return "en-GB";
  for (const [code, name] of [["te", "telugu"], ["hi", "hindi"], ["ta", "tamil"], ["kn", "kannada"], ["mr", "marathi"], ["bn", "bengali"], ["gu", "gujarati"], ["ml", "malayalam"], ["pa", "punjabi"]]) {
    if (clean.startsWith(code) || clean.includes(name)) return `${code}-IN`;
  }
  return "en-IN";
}

export interface BrowserCallPlaygroundProps {
  agentId: string;
  agentName: string;
  language: string;
  voiceName: string;
  systemPrompt?: string;
  bundle?: AgentBundle;
  voiceId?: string;
  embedded?: boolean;
}

interface Message { id: string; role: "user" | "assistant"; content: string; final: boolean }
interface Session {
  room: Room;
  endpoint: string;
  callId?: string;
  mic?: LocalAudioTrack;
  cancelled: boolean;
  audio: Set<HTMLMediaElement>;
  workerTimeout?: ReturnType<typeof setTimeout>;
  endRequest?: Promise<void>;
  initRequest?: Promise<void>;
  ending?: boolean;
}

async function endServerSession(session: Session) {
  if (!session.callId) return;
  if (!session.endRequest) {
    session.endRequest = fetch(session.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ action: "end_call", callId: session.callId }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("The room could not be closed. Try ending the call again.");
    }).catch((error) => { session.endRequest = undefined; throw error; });
  }
  return session.endRequest;
}

function releaseMedia(session: Session) {
  session.cancelled = true;
  clearTimeout(session.workerTimeout);
  session.mic?.stop();
  session.room.removeAllListeners();
  session.room.unregisterTextStreamHandler("lk.transcription");
  for (const audio of session.audio) { audio.pause(); audio.srcObject = null; audio.remove(); }
  session.audio.clear();
  return session.room.disconnect(true);
}

export function BrowserCallPlayground({ agentId, agentName, language, voiceName, systemPrompt, bundle, voiceId, embedded = false }: BrowserCallPlaygroundProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(resolveSpeechLanguageCode(language));
  const [phase, setPhase] = useState<"idle" | "connecting" | "connected" | "ending" | "cleanup">("idle");
  const [agentState, setAgentState] = useState("Waiting for voice worker");
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const mounted = useRef(true);
  const audioContainer = useRef<HTMLDivElement>(null);

  const endCall = useCallback(async (reason?: string) => {
    const session = sessionRef.current;
    if (!session || session.ending) return;
    session.ending = true;
    if (mounted.current) { setPhase("ending"); if (reason) setError(reason); }
    let closed = false;
    try {
      const mediaCleanup = releaseMedia(session);
      // An in-flight init owns the eventual call ID. Keep this session locked
      // until it is consumed so cancellation cannot orphan a server room.
      const serverCleanup = (async () => {
        await session.initRequest?.catch(() => {});
        await endServerSession(session);
      })();
      const results = await Promise.allSettled([mediaCleanup, serverCleanup]);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      closed = true;
      if (mounted.current && sessionRef.current === session) setEnded(Boolean(session.callId));
    } catch (err) {
      if (mounted.current && sessionRef.current === session) setError(err instanceof Error ? err.message : "Could not close voice session");
    } finally {
      session.ending = false;
      if (mounted.current && sessionRef.current === session) { setPhase(closed ? "idle" : "cleanup"); setMuted(false); setAudioBlocked(false); }
      if (closed && sessionRef.current === session) sessionRef.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = sessionRef.current;
      if (session) {
        sessionRef.current = null;
        void releaseMedia(session).catch(() => {});
        void endServerSession(session).catch(() => {});
      }
    };
  }, [agentId]);

  useEffect(() => {
    // Keep the selector aligned when the surrounding editor changes language.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedLanguage(resolveSpeechLanguageCode(language));
  }, [language]);

  useEffect(() => {
    if (phase !== "connected") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const startCall = async () => {
    if (sessionRef.current) {
      setError("End the previous session before starting another call.");
      return;
    }
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const session: Session = { room, endpoint: `/api/agents/${agentId}/test-session`, cancelled: false, audio: new Set() };
    sessionRef.current = session;
    const active = () => mounted.current && sessionRef.current === session && !session.cancelled;
    setPhase("connecting"); setError(null); setMessages([]); setEnded(false); setSeconds(0);
    setAgentState("Waiting for voice worker");
    const transcript = (id: string, identity: string, content: string, final: boolean) => {
      if (!active()) return;
      const message: Message = { id: `${identity}:${id}`, role: identity === room.localParticipant.identity ? "user" : "assistant", content, final };
      setMessages((previous) => {
        const index = previous.findIndex((item) => item.id === message.id);
        if (index < 0) return [...previous, message];
        return previous.map((item, i) => i === index ? message : item);
      });
    };
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (!active() || track.kind !== Track.Kind.Audio) return;
      const audio = track.attach();
      session.audio.add(audio);
      audioContainer.current?.appendChild(audio);
      void audio.play().catch(() => { if (active()) setAudioBlocked(true); });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      for (const element of track.detach()) { session.audio.delete(element); element.remove(); }
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (active()) setAudioBlocked(!room.canPlaybackAudio); });
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      if (participant) for (const segment of segments) transcript(segment.id, participant.identity, segment.text, segment.final);
    });
    // Current Python Agents publishes transcription via text streams; support
    // older SDK transcription events above as well, keyed by segment identity.
    room.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
      const id = reader.info.attributes?.["lk.segment_id"] ?? reader.info.id;
      let text = "";
      try {
        for await (const chunk of reader) {
          text += chunk;
          transcript(id, participant.identity, text, false);
        }
        transcript(id, participant.identity, text, true);
      } catch { if (active()) setError("A transcription stream was interrupted."); }
    });
    room.on(RoomEvent.ParticipantAttributesChanged, (_, participant) => {
      if (active() && participant.isAgent) {
        const state = participant.attributes["lk.agent.state"];
        if (state && state !== "initializing") clearTimeout(session.workerTimeout);
        setAgentState(state || "Connected");
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (active() && participant.isAgent) void endCall("The voice worker disconnected.");
    });
    room.on(RoomEvent.Reconnecting, () => { if (active()) setAgentState("Reconnecting"); });
    room.on(RoomEvent.Reconnected, () => { if (active()) setAgentState("Connected"); });
    room.on(RoomEvent.Disconnected, () => { if (active()) void endCall("The voice session disconnected."); });
    room.on(RoomEvent.MediaDevicesError, () => { if (active()) void endCall("Microphone access was lost."); });
    try {
      session.mic = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (!active()) { session.mic.stop(); return; }
      // Do not abort init on unmount: consume its response and terminate any
      // room it created, rather than losing the only call ID for cleanup.
      let data: { callId?: string; livekitUrl?: string; livekitToken?: string } = {};
      session.initRequest = fetch(session.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", voiceId, language: selectedLanguage, systemPrompt, bundle }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to start voice session");
        data = payload;
        session.callId = payload.callId;
      });
      await session.initRequest;
      if (!active()) { await endServerSession(session); return; }
      if (!data.callId || !data.livekitUrl || !data.livekitToken) throw new Error("Incomplete LiveKit session response");
      await room.connect(data.livekitUrl, data.livekitToken, { autoSubscribe: true });
      if (!active()) { await releaseMedia(session); await endServerSession(session); return; }
      await room.localParticipant.publishTrack(session.mic);
      if (!active()) { await releaseMedia(session); await endServerSession(session); return; }
      await room.startAudio().catch(() => { if (active()) setAudioBlocked(true); });
      if (!active()) return;
      setPhase("connected");
      session.workerTimeout = setTimeout(() => { if (active()) void endCall("The voice worker did not become ready. Check that it is running and its providers are configured."); }, 35000);
      for (const participant of room.remoteParticipants.values()) {
        const state = participant.attributes["lk.agent.state"];
        if (participant.isAgent && state && state !== "initializing") { clearTimeout(session.workerTimeout); setAgentState(state); }
      }
    } catch (err) {
      if (active()) await endCall(err instanceof Error ? err.message : "Voice connection failed");
      else { await releaseMedia(session).catch(() => {}); await endServerSession(session).catch(() => {}); }
    }
  };

  const toggleMic = async () => {
    const session = sessionRef.current;
    if (!session || session.cancelled || !session.mic) return;
    try {
      if (session.mic.isMuted) await session.mic.unmute(); else await session.mic.mute();
      if (!session.cancelled) setMuted(session.mic.isMuted);
    } catch { await endCall("Unable to control the microphone."); }
  };

  return <div className={embedded ? "space-y-5" : "rounded-xl border border-gray-200 dark:border-neutral-800 p-5 space-y-5"}>
    <div ref={audioContainer} className="hidden" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">{agentName} <Badge variant="blue">Live voice test</Badge></h3><p className="text-xs text-gray-500">{voiceName} · LiveKit audio</p></div>
      <label className="text-xs">Language <select aria-label="Voice test language" className="border rounded p-1 bg-transparent" value={selectedLanguage} disabled={phase !== "idle"} onChange={(event) => setSelectedLanguage(event.target.value)}>
        {SUPPORTED_STT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select></label>
      {phase === "idle" ? <Button size="sm" onClick={startCall}><PhoneCall className="w-4 h-4 mr-2" />Start Web Call</Button> : <Button size="sm" variant="destructive" disabled={phase === "ending"} onClick={() => void endCall()}><PhoneOff className="w-4 h-4 mr-2" />{phase === "ending" ? "Ending…" : "End Call"}</Button>}
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="rounded-xl border p-6 text-center space-y-3" aria-live="polite">
      {phase === "connecting" ? <p><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Connecting microphone and voice worker…</p> : phase === "connected" ? <><p className="capitalize">{agentState}</p><p className="font-mono text-sm">{Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</p><p className="text-xs text-gray-500">Speak naturally. You can interrupt the agent while your microphone is live.</p></> : <p className="text-sm text-gray-500">Test the voice worker using your microphone. Allow microphone access to begin.</p>}
      {phase === "connected" && <Button size="sm" variant="outline" onClick={toggleMic}>{muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}{muted ? "Unmute microphone" : "Mute microphone"}</Button>}
      {audioBlocked && <Button size="sm" onClick={() => void sessionRef.current?.room.startAudio().catch(() => setError("Audio playback is blocked. Allow audio in your browser."))}><Volume2 className="w-4 h-4 mr-2" />Enable audio playback</Button>}
    </div>
    {messages.length > 0 && <div className="max-h-72 overflow-y-auto rounded-xl border p-4 space-y-3" aria-label="Live transcript">{messages.map((message) => <p key={message.id} className={`text-sm ${message.final ? "" : "opacity-60"}`}><strong>{message.role === "user" ? "You" : agentName}:</strong> {message.content}</p>)}</div>}
    {ended && <p className="text-xs text-gray-500">Session ended. Worker-generated call details may take a moment to appear. <Link href="/calls" className="underline">View Call Logs</Link></p>}
  </div>;
}
