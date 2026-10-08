"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AgentBundle } from "@/lib/agent-bundle/schema";
import { BrowserCallPlayground } from "@/components/builder/browser-call-playground";
import { Headphones, PhoneCall } from "lucide-react";

interface TestCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  bundle: AgentBundle;
}

export function TestCallModal({ isOpen, onClose, agentId, bundle }: TestCallModalProps) {
  // Optional variable values for test session
  const [sampleLeadName, setSampleLeadName] = useState("");
  const [samplePhone, setSamplePhone] = useState("");
  const [callActive, setCallActive] = useState(false);

  // Substitute variables in first response for the test call
  const resolvedGreeting = (bundle.first_response || "")
    .replace(/\{\{lead_name\}\}/g, sampleLeadName || "")
    .replace(/\{\{phone\}\}/g, samplePhone || "");

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
      title={`Live Voice Test — ${bundle.exported_from.employee_name}`}
      description="Speak to your draft agent directly in your browser with real-time speech recognition and neural voice playback."
      maxWidth="2xl"
    >
      <div className="space-y-4 py-2">
        {!callActive ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/50 space-y-3">
              <span className="text-xs font-semibold text-gray-900 dark:text-white block">
                Test Call Lead Variables (Optional):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-neutral-400 mb-1">
                    lead_name (Lead Name)
                  </label>
                  <input
                    type="text"
                    value={sampleLeadName}
                    onChange={(e) => setSampleLeadName(e.target.value)}
                    placeholder="e.g. Suresh Reddy"
                    className="w-full rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-1.5 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-neutral-400 mb-1">
                    phone (Phone Number)
                  </label>
                  <input
                    type="text"
                    value={samplePhone}
                    onChange={(e) => setSamplePhone(e.target.value)}
                    placeholder="e.g. +91 98480 12345"
                    className="w-full rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-1.5 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <span className="text-[11px] text-gray-400 dark:text-neutral-500 block mb-1">
                  Opening Greeting Preview:
                </span>
                <p className="text-xs font-medium text-gray-700 dark:text-neutral-300 italic bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-gray-200 dark:border-neutral-800">
                  &ldquo;{resolvedGreeting}&rdquo;
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartCall}
                className="gap-2 shadow-xs"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Start Test Conversation</span>
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
              embedded={true}
            />

            <div className="flex justify-end pt-1">
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
