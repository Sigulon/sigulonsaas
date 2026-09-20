"use client";

import { useState } from "react";
import { VoiceAgent } from "@/lib/types";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CARTESIA_VOICE_PRESETS, INDIAN_LANGUAGES } from "@/lib/cartesia";
import {
  Bot,
  Phone,
  PhoneCall,
  Volume2,
  Edit,
  PlusCircle,
  Loader2,
  Headphones,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TestCallDialog } from "./test-call-dialog";
import { AgentEditorDialog } from "./agent-editor-dialog";
import { WebVoiceTesterModal } from "./web-voice-tester-modal";

interface AgentCardProps {
  agent: VoiceAgent;
  onRefresh: () => void;
}

export function AgentCard({ agent, onRefresh }: AgentCardProps) {
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isWebTesterOpen, setIsWebTesterOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<Array<{ id: string; phoneNumber: string; agentId: string | null }>>([]);
  const [selectedExistingNumberId, setSelectedExistingNumberId] = useState("");
  const [customNumberInput, setCustomNumberInput] = useState("");
  const [attachingNumber, setAttachingNumber] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const voice = CARTESIA_VOICE_PRESETS.find((v) => v.id === agent.voice_id) || {
    name: "Cartesia Indian Sonic Voice",
    accent: "Indian Accent",
  };

  const langObj = INDIAN_LANGUAGES.find((l) => l.code === agent.language) || {
    name: agent.language ? agent.language.toUpperCase() : "Hindi",
    nativeName: "हिन्दी",
  };

  const assignedNumber = agent.phone_numbers?.[0];

  const handleOpenAttachModal = async () => {
    setIsAttachModalOpen(true);
    setAttachError(null);
    try {
      const res = await fetch("/api/phone-numbers");
      if (res.ok) {
        const data = await res.json();
        setAvailableNumbers(data.phoneNumbers || []);
      }
    } catch {
      // Fallback
    }
  };

  const handleAttachNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttachingNumber(true);
    setAttachError(null);

    try {
      if (customNumberInput.trim()) {
        const res = await fetch(`/api/agents/${agent.id}/numbers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: customNumberInput.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to attach phone number");
      } else if (selectedExistingNumberId) {
        const res = await fetch(`/api/phone-numbers/${selectedExistingNumberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: agent.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to assign phone number");
      } else {
        throw new Error("Please select an existing number or enter a new Plivo number.");
      }

      setIsAttachModalOpen(false);
      setCustomNumberInput("");
      setSelectedExistingNumberId("");
      onRefresh();
    } catch (err: unknown) {
      setAttachError(err instanceof Error ? err.message : "Failed to attach number");
    } finally {
      setAttachingNumber(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col justify-between hover:border-violet-200 dark:hover:border-violet-900/60 transition-all shadow-sm hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-stone-900 dark:text-white leading-snug">
                  {agent.name}
                </h3>
                <span className="text-[11px] text-stone-400 font-mono">
                  Agent ID: {agent.id ? agent.id.slice(-8) : "—"}
                </span>
              </div>
            </div>

            <Badge variant={agent.status === "active" ? "success" : "secondary"}>
              {agent.status === "active" ? "Working" : agent.status === "paused" ? "Paused" : agent.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-xs text-stone-600 dark:text-stone-300">
          {/* Voice Model & Indian Language */}
          <div className="flex items-center justify-between rounded-lg bg-stone-50 dark:bg-stone-800/60 p-2.5">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-violet-600" />
              <span className="font-medium text-stone-800 dark:text-stone-200 text-xs">
                {voice.name}
              </span>
            </div>
            <span className="rounded-md bg-violet-100 dark:bg-violet-950 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
              {langObj.name}
            </span>
          </div>

          {/* Assigned Phone Number */}
          <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 p-2.5">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-stone-400" />
              {assignedNumber ? (
                <span className="font-mono font-semibold text-stone-900 dark:text-white">
                  {assignedNumber.phone_number}
                </span>
              ) : (
                <span className="text-stone-400 italic">No telephony line attached</span>
              )}
            </div>

            {assignedNumber ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleOpenAttachModal}
                className="h-6 text-[10px] px-1.5 text-stone-500 hover:text-violet-600"
              >
                Change
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenAttachModal}
                className="h-7 text-xs px-2 flex items-center gap-1 border-violet-200 text-violet-600 hover:bg-violet-50"
              >
                <PlusCircle className="h-3 w-3" />
                Attach Line
              </Button>
            )}
          </div>

          {/* System Prompt snippet */}
          <div>
            <span className="text-[11px] font-medium text-stone-400 block mb-1">
              Instructions & Script:
            </span>
            <p className="line-clamp-3 rounded-lg bg-stone-50 dark:bg-stone-900 p-2.5 text-xs text-stone-600 dark:text-stone-400 font-mono">
              {agent.system_prompt || "No system prompt configured."}
            </p>
          </div>
        </CardContent>

        <CardFooter className="pt-2 border-t border-stone-100 dark:border-stone-800 flex flex-col gap-2">
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsWebTesterOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-300 hover:bg-violet-50"
            >
              <Headphones className="h-3.5 w-3.5" />
              Web Test Voice
            </Button>

            <Button
              size="sm"
              onClick={() => setIsTestCallOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Phone Dial
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditorOpen(true)}
            className="w-full text-xs text-stone-500 hover:text-stone-900 flex items-center justify-center gap-1"
          >
            <Edit className="h-3 w-3" />
            Configure Agent Settings
          </Button>
        </CardFooter>
      </Card>

      <TestCallDialog
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
        defaultAgentId={agent.id}
      />

      <AgentEditorDialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        agent={agent}
        onSaved={onRefresh}
      />

      <WebVoiceTesterModal
        isOpen={isWebTesterOpen}
        onClose={() => setIsWebTesterOpen(false)}
        agent={agent}
      />

      {/* Attach Phone Line Modal */}
      <Modal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        title={`Attach Plivo Number — ${agent.name}`}
        description="Select a registered Plivo number or connect a new phone number to this voice agent."
        maxWidth="md"
      >
        <form onSubmit={handleAttachNumber} className="space-y-4 pt-2 text-xs">
          {availableNumbers.length > 0 && (
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">
                Choose from Existing Plivo Numbers:
              </label>
              <select
                value={selectedExistingNumberId}
                onChange={(e) => {
                  setSelectedExistingNumberId(e.target.value);
                  if (e.target.value) setCustomNumberInput("");
                }}
                className="w-full text-xs bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 rounded-lg p-2 font-mono"
              >
                <option value="">— Select an existing number —</option>
                {availableNumbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.phoneNumber} {n.agentId === agent.id ? "(Currently Attached)" : n.agentId ? "(Assigned to another agent)" : "(Unassigned)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-stone-200 dark:border-stone-800"></div>
            <span className="shrink mx-2 text-[10px] uppercase text-stone-400 font-semibold">Or enter new number</span>
            <div className="grow border-t border-stone-200 dark:border-stone-800"></div>
          </div>

          <div>
            <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">
              Add New Plivo Number (E.164 format):
            </label>
            <Input
              type="text"
              placeholder="+919876543210 or +15551234567"
              value={customNumberInput}
              onChange={(e) => {
                setCustomNumberInput(e.target.value);
                if (e.target.value) setSelectedExistingNumberId("");
              }}
              className="text-xs font-mono"
            />
          </div>

          {attachError && (
            <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
              {attachError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Link
              href="/phone-numbers"
              className="text-violet-600 hover:underline flex items-center gap-1 text-[11px]"
            >
              <Radio className="h-3 w-3" />
              Manage All Numbers
            </Link>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAttachModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={attachingNumber || (!selectedExistingNumberId && !customNumberInput.trim())}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {attachingNumber ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Attaching...
                  </>
                ) : (
                  "Attach Line"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
