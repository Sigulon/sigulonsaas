"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AgentBundle } from "@/lib/agent-bundle/schema";
import { BrowserCallPlayground } from "@/components/builder/browser-call-playground";
import { Headphones, PhoneCall, Play, Sparkles } from "lucide-react";

interface TestCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  bundle: AgentBundle;
}

export function TestCallModal({ isOpen, onClose, agentId, bundle }: TestCallModalProps) {
  // Sample variable values state
  const [sampleLeadName, setSampleLeadName] = useState("రమేష్");
  const [samplePhone, setSamplePhone] = useState("+91 98765 43210");
  const [callActive, setCallActive] = useState(false);

  // Substitute variables in first response for the test call
  const resolvedGreeting = bundle.first_response
    .replace(/\{\{lead_name\}\}/g, sampleLeadName)
    .replace(/\{\{phone\}\}/g, samplePhone);

  const handleStartCall = () => {
    setCallActive(true);
  };

  const handleReset = () => {
    setCallActive(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setCallActive(false);
        onClose();
      }}
      title={`Test Call in Browser — ${bundle.exported_from.employee_name}`}
      description="Speak to your draft agent directly in your browser. Audio is processed with Cartesia Sonic-3 and LiveKit Inference."
      maxWidth="2xl"
    >
      <div className="space-y-4 py-2">
        {!callActive ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Provide Sample Variable Values for Test Call:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    lead_name (Lead Name)
                  </label>
                  <input
                    type="text"
                    value={sampleLeadName}
                    onChange={(e) => setSampleLeadName(e.target.value)}
                    className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-950 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    phone (Phone Number)
                  </label>
                  <input
                    type="text"
                    value={samplePhone}
                    onChange={(e) => setSamplePhone(e.target.value)}
                    className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-950 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-1">
                <span className="text-[11px] text-slate-400 block mb-1">Opening Greeting Preview:</span>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                  &ldquo;{resolvedGreeting}&rdquo;
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={onClose} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleStartCall}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1.5"
              >
                <Headphones className="h-3.5 w-3.5" /> Start Test Conversation
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <BrowserCallPlayground
              agentId={agentId}
              agentName={bundle.exported_from.employee_name}
              language={bundle.exported_from.language}
              voiceName="Ramya (Telugu - Warm)"
              voiceId="cf061d8b-a752-4865-81a2-57570a6e0565"
              systemPrompt={bundle.sections.map((s) => s.prompt).join("\n\n")}
            />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                Back to Settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
