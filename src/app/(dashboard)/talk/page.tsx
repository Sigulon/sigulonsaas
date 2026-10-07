"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  Clock,
  Sparkles,
  Zap,
  Globe,
  Volume2,
  CheckCircle2,
  RotateCcw,
  User,
  Bot,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAgents } from "@/lib/api/agents";
import { Agent } from "@/lib/types/sigulon";

export default function TalkPage() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");

  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const data = await getAgents();
        setAgentsList(data);
        if (data.length > 0) {
          const match = agentParam ? data.find((a) => a.id === agentParam) : data[0];
          setSelectedAgent(match || data[0]);
        }
      } catch (err) {
        console.error("[talk] Error loading agents:", err);
      }
    }
    loadAgents();
  }, [agentParam]);

  const [callState, setCallState] = useState<"idle" | "connecting" | "connected" | "ended">("idle");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ speaker: "agent" | "user"; text: string; time: string }>>([]);

  // Call timer effect
  useEffect(() => {
    let interval: any;
    if (callState === "connected") {
      interval = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  const handleStartCall = () => {
    if (!selectedAgent) return;
    setCallState("connecting");
    setTimerSeconds(0);
    setTranscript([]);

    setTimeout(() => {
      setCallState("connected");
      setTranscript([
        {
          speaker: "agent",
          text: selectedAgent.openingMessage.replace("{{lead_name}}", "Praveen"),
          time: "00:02",
        },
      ]);

      // Simulate realistic conversation turns
      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: "user",
            text:
              selectedAgent.language === "Telugu"
                ? "నమస్కారం రవి గారు, నా కారు ఇన్సూరెన్స్ రెన్యూవల్ గురించి తెలుసుకోవాలి."
                : selectedAgent.language === "Hindi"
                ? "नमस्ते इमरान जी, मुझे 3BHK फ्लैट्स के बारे में जानकारी चाहिए।"
                : "Hello, I wanted to enquire about villa pricing in Gachibowli.",
            time: "00:08",
          },
        ]);
      }, 4000);

      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: "agent",
            text:
              selectedAgent.language === "Telugu"
                ? "ఖచ్చితంగా సార్! మీ క్రెటా కారు పాలసీ ఈ నెలాఖరుకు ముగుస్తుంది కదా, 25% నో-క్లెయిమ్ బోనస్ డిస్కౌంట్ తో జీరో-డెప్ కొటేషన్ రెడీగా ఉంది."
                : selectedAgent.language === "Hindi"
                ? "बिल्कुल सर! हमारे सिग्मा हाइट्स प्रोजेक्ट में रेडी-टू-मूव 3BHK फ्लैट्स 2.2 करोड़ से शुरू हैं। क्या आप इस वीकेंड विजिट करेंगे?"
                : "Certainly! We have 4,200 sq.ft duplex villas available with private garden and home automation starting at ₹3.5 Crore.",
            time: "00:15",
          },
        ]);
      }, 8000);
    }, 1500);
  };

  const handleEndCall = () => {
    setCallState("ended");
  };

  const handleReset = () => {
    setCallState("idle");
    setTimerSeconds(0);
    setTranscript([]);
  };

  if (!selectedAgent) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Loading voice agents...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Talk to an Agent
        </h1>
        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
          Live browser testing console. Experience ultra-low latency conversational AI before dialing leads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Agent Selector */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                Select Voice Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              {agentsList.map((ag) => (
                <button
                  key={ag.id}
                  disabled={callState === "connected" || callState === "connecting"}
                  onClick={() => {
                    setSelectedAgent(ag);
                    handleReset();
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedAgent.id === ag.id
                      ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-2xs"
                      : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">
                      {ag.name}
                    </span>
                    <Badge variant={ag.status === "ready" ? "success" : "secondary"}>
                      {ag.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400 mt-1 line-clamp-1">
                    {ag.role}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                    <Globe className="w-3 h-3" />
                    <span>{ag.language}</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Center: Large Interactive Call Interface */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-gray-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between min-h-[520px]">
            {/* Call State Bar */}
            <div className="p-4 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-850">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    callState === "connected"
                      ? "bg-emerald-500 animate-pulse"
                      : callState === "connecting"
                      ? "bg-amber-500 animate-ping"
                      : "bg-gray-400"
                  }`}
                />
                <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 capitalize">
                  {callState === "idle" && "Ready to talk"}
                  {callState === "connecting" && "Establishing LiveKit WebRTC Session..."}
                  {callState === "connected" && "● Live Session Connected"}
                  {callState === "ended" && "Call Concluded"}
                </span>
              </div>

              {callState === "connected" && (
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-900 dark:text-white bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md border border-gray-200 dark:border-neutral-700">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{formatTimer(timerSeconds)}</span>
                </div>
              )}
            </div>

            {/* Middle Voice Visualizer & Transcript */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center">
              {callState === "idle" && (
                <div className="text-center max-w-sm space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
                    <Radio className="w-9 h-9" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Talk with {selectedAgent.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
                      Start a two-way browser audio session powered by LiveKit, Deepgram Nova-3, Gemini 2.5 Flash, and Cartesia Sonic 3.6.
                    </p>
                  </div>
                  <Button variant="primary" size="lg" onClick={handleStartCall} className="gap-2 px-6">
                    <PhoneCall className="w-4 h-4" />
                    <span>Start call</span>
                  </Button>
                </div>
              )}

              {callState === "connecting" && (
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center mx-auto animate-pulse">
                    <Activity className="w-8 h-8" />
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Connecting to voice runtime...
                  </div>
                  <p className="text-xs text-gray-400">Negotiating WebRTC codecs</p>
                </div>
              )}

              {callState === "connected" && (
                <div className="w-full flex-1 flex flex-col justify-between space-y-6">
                  {/* Waveform Animation */}
                  <div className="flex items-center justify-center gap-1.5 h-16">
                    {[32, 54, 80, 44, 96, 68, 88, 38, 72, 90, 48, 62, 85].map((h, i) => (
                      <span
                        key={i}
                        className="w-1.5 bg-blue-600 dark:bg-blue-500 rounded-full animate-pulse"
                        style={{
                          height: `${h}%`,
                          animationDelay: `${i * 0.08}s`,
                          animationDuration: "0.8s",
                        }}
                      />
                    ))}
                  </div>

                  {/* Transcript Scroll Area */}
                  <div className="flex-1 bg-gray-50/70 dark:bg-neutral-950 p-4 rounded-xl border border-gray-100 dark:border-neutral-800 space-y-3 max-h-56 overflow-y-auto">
                    {transcript.map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-2.5 text-xs ${
                          line.speaker === "agent" ? "items-start" : "items-start flex-row-reverse"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            line.speaker === "agent"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-700 text-white"
                          }`}
                        >
                          {line.speaker === "agent" ? selectedAgent.name.charAt(0) : "U"}
                        </div>
                        <div
                          className={`p-2.5 rounded-lg max-w-[85%] ${
                            line.speaker === "agent"
                              ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white border border-gray-100 dark:border-neutral-800"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          <div className="text-[10px] opacity-70 mb-0.5">{line.time}</div>
                          <div className="leading-relaxed">{line.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {callState === "ended" && (
                <div className="text-center space-y-3 py-6">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Call Completed
                  </h3>
                  <p className="text-xs text-gray-500">
                    Duration: {formatTimer(timerSeconds)} · Latency: 390ms average
                  </p>
                  <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Start New Session</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Bottom Controls Bar */}
            {callState === "connected" && (
              <div className="p-4 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-center gap-4 bg-gray-50/50 dark:bg-neutral-900">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff className="w-4 h-4 text-red-600" /> : <Mic className="w-4 h-4" />}
                </Button>

                <Button variant="destructive" size="sm" onClick={handleEndCall} className="gap-2">
                  <PhoneOff className="w-4 h-4" />
                  <span>End call</span>
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Telephony & Intelligence Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tech Specs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                Call Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">Voice Latency:</span>
                <span className="font-mono font-semibold text-blue-600">390ms</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">STT Engine:</span>
                <span className="font-mono text-gray-800 dark:text-neutral-200">Deepgram Nova-3</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">LLM Provider:</span>
                <span className="font-mono text-gray-800 dark:text-neutral-200">Gemini 2.5 Flash</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">TTS Engine:</span>
                <span className="font-mono text-gray-800 dark:text-neutral-200">Cartesia Sonic 3.6</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Language:</span>
                <span className="font-semibold text-gray-800 dark:text-neutral-200">{selectedAgent.language}</span>
              </div>
            </CardContent>
          </Card>

          {/* AI Intelligence / Post-Call Outcome */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                Extracted Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 block mb-1">Qualification Score:</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[94%]" />
                  </div>
                  <span className="font-mono font-bold text-emerald-600">94/100</span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 block mb-0.5">Detected Intent:</span>
                <div className="font-medium text-gray-900 dark:text-white">
                  Insurance Renewal & Discount Check
                </div>
              </div>

              <div>
                <span className="text-gray-400 block mb-0.5">Recommended Next Action:</span>
                <div className="text-blue-600 font-medium">
                  Trigger Advisor Callback @ 4:00 PM
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
