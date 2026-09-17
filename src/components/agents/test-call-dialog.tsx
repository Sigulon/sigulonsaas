"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneCall, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { VoiceAgent } from "@/lib/types";

interface TestCallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAgentId?: string;
}

export function TestCallDialog({ isOpen, onClose, defaultAgentId }: TestCallDialogProps) {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callerNumber, setCallerNumber] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<{ callId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dialog reset on open.
    setSuccessResult(null);
    setError(null);

    void Promise.all([
      fetch("/api/agents", { signal: controller.signal }),
      fetch("/api/phone-numbers", { signal: controller.signal }),
    ])
      .then(async ([agentsResponse, numbersResponse]) => {
        if (agentsResponse.ok) {
          const data = await agentsResponse.json();
          if (data.agents?.length) {
            setAgents(data.agents);
            setSelectedAgentId((current) =>
              current || defaultAgentId || data.agents[0].id
            );
          }
        }
        if (numbersResponse.ok) {
          const data = await numbersResponse.json();
          if (data.phoneNumbers?.length) {
            const nums = data.phoneNumbers.map(
              (p: { phoneNumber: string }) => p.phoneNumber
            );
            setAvailableNumbers(nums);
            setCallerNumber((current) => current || nums[0]);
          }
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          console.warn("Unable to load call-test options", error);
        }
      });

    return () => controller.abort();
  }, [isOpen, defaultAgentId]);

  const handleDial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || !selectedAgentId) return;

    setLoading(true);
    setError(null);
    setSuccessResult(null);

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          agentId: selectedAgentId,
          toNumber: phoneNumber,
          fromNumber: callerNumber || undefined,
          metadata: { source: "test_dialer" },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger call");
      }

      const returnedCallId =
        data.call?.provider_call_id || data.call?.id || "Plivo Call Dispatched";
      setSuccessResult({ callId: returnedCallId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Test Voice Agent Dial via Plivo"
      description="Dial any mobile or landline phone number directly via Plivo to test live speech, low latency responses, and conversational agent instructions."
      maxWidth="md"
    >
      {successResult ? (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white">Plivo Call Dispatched!</h3>
          <p className="text-sm text-slate-500">
            Plivo is placing your outbound voice call to <span className="font-semibold text-slate-800 dark:text-slate-200">{phoneNumber}</span>. Your phone will ring shortly.
          </p>
          <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-600 dark:text-slate-400">
            Plivo Call ID: {successResult.callId}
          </div>
          <Button className="w-full mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleDial} className="space-y-4 py-2">
          {error && (
            <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              {(error.toLowerCase().includes("credential") ||
                error.toLowerCase().includes("auth id") ||
                error.toLowerCase().includes("auth token") ||
                (error.toLowerCase().includes("plivo") &&
                  !error.toLowerCase().includes("answer_url") &&
                  !error.toLowerCase().includes("public_web_url") &&
                  !error.toLowerCase().includes("tunnel") &&
                  !error.toLowerCase().includes("not valid"))) && (
                <a
                  href="/phone-numbers"
                  className="text-xs text-indigo-600 underline font-medium hover:text-indigo-800 ml-6"
                >
                  Configure Plivo Credentials &rarr;
                </a>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Select Voice Agent
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              required
            >
              {agents.length === 0 && <option value="">No agents in database yet</option>}
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.language ? ag.language.toUpperCase() : "EN"})
                </option>
              ))}
            </select>
          </div>

          {availableNumbers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Caller ID (Plivo Number)
              </label>
              <select
                value={callerNumber}
                onChange={(e) => setCallerNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                {availableNumbers.map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Destination Phone Number (E.164 format)
            </label>
            <Input
              type="tel"
              placeholder="+919876543210 or +15551234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Include country code (+91 for India, +1 for US/Canada, etc.).
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !phoneNumber || !selectedAgentId}
              className="bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Plivo Dialing...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="h-4 w-4" />
                  <span>Place Plivo Call</span>
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
