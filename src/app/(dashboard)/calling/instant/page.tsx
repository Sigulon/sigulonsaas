"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  Phone,
  Bot,
  User,
  Sparkles,
  PhoneCall,
  PhoneOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgents } from "@/lib/api/agents";
import { createLead } from "@/lib/api/leads";
import { recordNewCall } from "@/lib/api/calls";
import { Agent } from "@/lib/types/sigulon";

export default function InstantLeadPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [leadName, setLeadName] = useState("");
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [callerId, setCallerId] = useState("+91 80 4719 3320");
  const [notes, setNotes] = useState("");

  // Call simulator state machine
  const [callStatus, setCallStatus] = useState<
    "idle" | "connecting" | "ringing" | "talking" | "completed"
  >("idle");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<Array<{ speaker: string; text: string; time: string }>>([]);

  useEffect(() => {
    async function loadAgents() {
      try {
        const ags = await getAgents();
        setAgentsList(ags);
        if (ags.length > 0) {
          setSelectedAgentId((prev) => prev || ags[0].id);
        }
      } catch (err) {
        console.error("[instant] Error loading agents:", err);
      }
    }
    loadAgents();
  }, []);

  const agent = agentsList.find((a) => a.id === selectedAgentId) || agentsList[0];

  useEffect(() => {
    let timer: any;
    if (callStatus === "talking") {
      timer = setInterval(() => {
        setDuration((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  const handleStartCall = async () => {
    if (!agent) return;
    setCallStatus("connecting");
    setDuration(0);
    setTranscript([]);

    // 1. Ringing state
    setTimeout(() => {
      setCallStatus("ringing");
    }, 1500);

    // 2. Callee answers -> Talking state
    setTimeout(() => {
      setCallStatus("talking");
      setTranscript([
        {
          speaker: agent.name,
          text: agent.openingMessage?.replace("{{lead_name}}", leadName || "Sir/Madam") || "నమస్తే అండి",
          time: "00:02",
        },
      ]);

      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: leadName || "Customer",
            text:
              agent.language === "Telugu"
                ? "హలో రవి గారు, నా క్రెటా కారు పాలసీ గురించి కదా! జీరో డెప్ కొటేషన్ ఎంత పడుతుంది?"
                : "नमस्ते, हाँ मुझे प्रीमियम डिटेल्स चाहिए।",
            time: "00:09",
          },
        ]);
      }, 3500);

      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: agent.name,
            text:
              agent.language === "Telugu"
                ? "సార్, జీరో-డెప్ తో కలిపి మీకు ₹18,500 వస్తుంది. మా సీనియర్ ఎగ్జిక్యూటివ్ 4 గంటలకు డీటెయిల్స్ తో కాల్ చేయమంటారా?"
                : "ज़रूर सर, हमारी टीम 4 बजे आपको पूरी कोटेशन भेजेगी।",
            time: "00:17",
          },
        ]);
      }, 7000);

      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: leadName || "Customer",
            text: "సరే, 4 గంటలకు చేయండి.",
            time: "00:24",
          },
        ]);
      }, 10000);
    }, 3500);
  };

  const handleEndCall = async () => {
    if (!agent) return;
    setCallStatus("completed");

    // Save lead and call record
    await createLead({
      name: leadName || "Direct Prospect",
      phone: phoneNumber,
      channel: "instant",
      agentId: agent.id,
      agentName: agent.name,
      status: "qualified",
      qualificationScore: 92,
      durationSeconds: duration,
      extractedVariables: {
        vehicle: "Hyundai Creta",
        preferred_time: "4:00 PM",
      },
    });

    await recordNewCall({
      calleeNumber: phoneNumber,
      callerNumber: callerId,
      direction: "outbound",
      type: "instant",
      agentId: agent.id,
      agentName: agent.name,
      durationSeconds: duration,
      outcome: "qualified",
      aiSummary: `Instant lead call with ${leadName}. Customer confirmed vehicle and requested quote at 4 PM.`,
    });
  };

  const handleReset = () => {
    setCallStatus("idle");
    setDuration(0);
    setTranscript([]);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Instant lead call
        </h1>
        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
          Dial a single high-priority prospect immediately with an AI voice agent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form (2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="border-gray-200 dark:border-neutral-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                Lead Dialing Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Phone number *
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    disabled={callStatus !== "idle"}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="+91 98480 XXXXX"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Lead Name
                  </label>
                  <input
                    type="text"
                    value={leadName}
                    disabled={callStatus !== "idle"}
                    onChange={(e) => setLeadName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Suresh Reddy"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Select Agent *
                  </label>
                  <select
                    value={selectedAgentId}
                    disabled={callStatus !== "idle" || agentsList.length === 0}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {agentsList.length === 0 ? (
                      <option value="">Loading agents...</option>
                    ) : (
                      agentsList.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name} ({ag.role} · {ag.language})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    Outbound Caller ID
                  </label>
                  <select
                    value={callerId}
                    disabled={callStatus !== "idle"}
                    onChange={(e) => setCallerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="+91 80 4719 3320">+91 80 4719 3320 (Bangalore)</option>
                    <option value="+91 40 4912 8840">+91 40 4912 8840 (Hyderabad)</option>
                    <option value="+91 22 5064 1190">+91 22 5064 1190 (Mumbai)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  Context / Notes for Agent
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  disabled={callStatus !== "idle"}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional context for the agent to know before speaking..."
                />
              </div>

              {callStatus === "idle" && (
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Estimated rate: <span className="font-mono font-semibold text-gray-900 dark:text-white">₹0.85/min</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartCall}
                    disabled={!phoneNumber || !agent}
                    className="gap-2"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call now</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Call Progress State Box */}
          {callStatus !== "idle" && (
            <Card className="border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden animate-in fade-in">
              <div className="p-4 bg-gray-50/50 dark:bg-neutral-850 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      callStatus === "talking"
                        ? "bg-emerald-500 animate-pulse"
                        : callStatus === "completed"
                        ? "bg-gray-400"
                        : "bg-amber-500 animate-ping"
                    }`}
                  />
                  <span className="text-xs font-semibold text-gray-900 dark:text-white capitalize">
                    {callStatus === "connecting" && "Connecting SIP trunk..."}
                    {callStatus === "ringing" && "Ringing Callee..."}
                    {callStatus === "talking" && "● Connected (Live Call in Progress)"}
                    {callStatus === "completed" && "Call Ended & Outcome Saved"}
                  </span>
                </div>

                {callStatus === "talking" && (
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                      {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, "0")}
                    </div>
                    <Button variant="destructive" size="sm" onClick={handleEndCall} className="h-7 text-xs">
                      End Call
                    </Button>
                  </div>
                )}

                {callStatus === "completed" && (
                  <Button variant="outline" size="sm" onClick={handleReset} className="h-7 text-xs gap-1">
                    <RotateCcw className="w-3 h-3" /> Dial Another
                  </Button>
                )}
              </div>

              {/* Streaming Transcript */}
              <div className="p-5 space-y-3 max-h-64 overflow-y-auto bg-white dark:bg-neutral-900">
                {transcript.map((line, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <span className="font-semibold text-blue-600">{line.speaker}: </span>
                    <span className="text-gray-800 dark:text-neutral-200">{line.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Info Summary (1 col) */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                Agent Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">Agent:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {agent ? agent.name : "Loading..."}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">Language:</span>
                <span>{agent ? agent.language : "-"}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
                <span className="text-gray-500">Voice:</span>
                <span>Cartesia Sonic 3.6</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Estimated Cost:</span>
                <span className="font-mono font-semibold text-emerald-600">₹0.85 / min</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
