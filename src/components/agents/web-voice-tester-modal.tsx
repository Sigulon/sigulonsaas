"use client";

import { Modal } from "@/components/ui/modal";
import { VoiceAgent } from "@/lib/types";
import { CARTESIA_VOICE_PRESETS } from "@/lib/cartesia";
import { BrowserCallPlayground } from "@/components/builder/browser-call-playground";

interface WebVoiceTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent?: VoiceAgent | null;
}

export function WebVoiceTesterModal({ isOpen, onClose, agent }: WebVoiceTesterModalProps) {
  const voice =
    CARTESIA_VOICE_PRESETS.find((v) => v.id === agent?.voice_id) || CARTESIA_VOICE_PRESETS[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Web Voice Call Simulator — ${agent?.name || "Agent"}`}
      description="Speak directly to your voice agent in your browser without dialing a phone number. Hands-free voice conversation powered by Cartesia Sonic-3."
      maxWidth="2xl"
    >
      <div className="py-2">
        <BrowserCallPlayground
          agentId={agent?.id || agent?.cartesia_agent_id || "demo"}
          agentName={agent?.name || "Voice Agent"}
          language={agent?.language || "hi"}
          voiceName={voice.name}
          voiceId={agent?.voice_id || voice.id}
          systemPrompt={agent?.system_prompt}
        />
      </div>
    </Modal>
  );
}
