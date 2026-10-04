"use client";

import { useState } from "react";
import { AgentBundle } from "@/lib/agent-bundle/schema";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, X, ArrowRight, AlertCircle } from "lucide-react";

interface AiAssistBoxProps {
  agentId: string;
  bundle: AgentBundle;
  onApplyModifiedBundle: (newBundle: AgentBundle) => void;
}

interface SectionDiff {
  section_key: string;
  label: string;
  type: "modified" | "added" | "removed" | "unchanged";
  beforePrompt?: string;
  afterPrompt?: string;
}

export function AiAssistBox({ agentId, bundle, onApplyModifiedBundle }: AiAssistBoxProps) {
  const [instruction, setInstruction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Diff state
  const [modifiedBundle, setModifiedBundle] = useState<AgentBundle | null>(null);
  const [diffSections, setDiffSections] = useState<SectionDiff[] | null>(null);
  const [firstResponseDiff, setFirstResponseDiff] = useState<{ before: string; after: string; changed: boolean } | null>(null);

  const handleApplyInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!text) return;

    setIsLoading(true);
    setError(null);
    setModifiedBundle(null);
    setDiffSections(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text,
          bundle,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `AI assist error (${res.status})`);
      }

      const data = await res.json();
      if (data.modifiedBundle && data.diff) {
        setModifiedBundle(data.modifiedBundle);
        setDiffSections(data.diff.sections || []);
        setFirstResponseDiff(data.diff.firstResponse || null);
      } else {
        throw new Error("Invalid response from AI assist");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process AI assist instruction");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    if (modifiedBundle) {
      onApplyModifiedBundle(modifiedBundle);
      setModifiedBundle(null);
      setDiffSections(null);
      setFirstResponseDiff(null);
      setInstruction("");
    }
  };

  const handleReject = () => {
    setModifiedBundle(null);
    setDiffSections(null);
    setFirstResponseDiff(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          AI Script Assistant
        </h4>
        <span className="text-[10px] text-slate-400">Natural language editor</span>
      </div>

      <form onSubmit={handleApplyInstruction} className="space-y-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder='e.g. "make it more polite", "ask budget earlier", "shorten opening"'
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
          disabled={isLoading || Boolean(modifiedBundle)}
        />

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Tell the AI how you want to adjust phrasing, flow, or rules.
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || !instruction.trim() || Boolean(modifiedBundle)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 px-3"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Modify
          </Button>
        </div>
      </form>

      {error && (
        <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Diff Review Modal / Drawer */}
      {modifiedBundle && diffSections && (
        <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 space-y-3 mt-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Proposed Script Changes (Review Diff)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={handleReject}
                className="text-xs h-7 text-slate-600 dark:text-slate-300"
              >
                <X className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={handleAccept}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7"
              >
                <Check className="h-3 w-3 mr-1" /> Accept Changes
              </Button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {/* Opening greeting change */}
            {firstResponseDiff && firstResponseDiff.changed && (
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Opening Greeting (first_response):
                </span>
                <div className="line-through text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-1.5 rounded">
                  {firstResponseDiff.before}
                </div>
                <div className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded">
                  {firstResponseDiff.after}
                </div>
              </div>
            )}

            {/* Section diffs */}
            {diffSections.map((sec) => {
              if (sec.type === "unchanged") return null;

              return (
                <div
                  key={sec.section_key}
                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {sec.label} ({sec.section_key})
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        sec.type === "modified"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                          : sec.type === "added"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300"
                      }`}
                    >
                      {sec.type.toUpperCase()}
                    </span>
                  </div>

                  {sec.beforePrompt && sec.type === "modified" && (
                    <div className="line-through text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2 rounded text-[11px] leading-relaxed">
                      {sec.beforePrompt}
                    </div>
                  )}

                  {sec.afterPrompt && (
                    <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded text-[11px] leading-relaxed">
                      {sec.afterPrompt}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
