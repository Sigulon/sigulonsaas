"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Rocket,
  Download,
  Upload,
  Headphones,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCode,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AgentBundle } from "@/lib/agent-bundle/schema";
import { validateAgentBundle, analyzeBundleVariables, repairAgentBundle } from "@/lib/agent-bundle/validator";
import { FlowGraph } from "@/components/editor/flow-graph";
import { ScriptEditor } from "@/components/editor/script-editor";
import { VariablesPanel } from "@/components/editor/variables-panel";
import { AiAssistBox } from "@/components/editor/ai-assist-box";
import { TestCallModal } from "@/components/editor/test-call-modal";

export default function AgentScriptEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [agent, setAgent] = useState<any | null>(null);
  const [bundle, setBundle] = useState<AgentBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Unsaved changes & autosave state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Highlighting section from graph click
  const [highlightedSectionKey, setHighlightedSectionKey] = useState<string | null>(null);

  // Modals state
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [validationIssues, setValidationIssues] = useState<string[] | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [importError, setImportError] = useState<string[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial agent and bundle
  const fetchAgent = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) {
        setLoadError(`Failed to load agent (${res.status})`);
        return;
      }
      const data = await res.json();
      if (data.agent) {
        setAgent(data.agent);
        let currentBundle = data.agent.bundle as AgentBundle | null;
        if (!currentBundle || typeof currentBundle !== "object") {
          // If no bundle existed, repair / synthesize one
          currentBundle = repairAgentBundle({
            bundle_version: 2,
            exported_from: {
              employee_name: data.agent.name || "AI Agent",
              employee_role: "Customer Representative",
              mode: "bulk",
              language: data.agent.language || "te-IN",
            },
            first_response: data.agent.introduction || "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?",
          });
        }
        setBundle(currentBundle);
      }
    } catch (err: any) {
      setLoadError(err.message || "Could not load agent details.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Save draft function
  const saveDraft = useCallback(
    async (bundleToSave: AgentBundle, showToast = false) => {
      setIsSaving(true);
      try {
        const res = await fetch(`/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: bundleToSave.exported_from.employee_name,
            bundle: bundleToSave,
            systemPrompt: bundleToSave.sections.map((s) => s.prompt).join("\n\n"),
            introduction: bundleToSave.first_response,
            language: bundleToSave.exported_from.language,
          }),
        });

        if (res.ok) {
          setHasUnsavedChanges(false);
          setLastSavedAt(new Date());
        }
      } catch (e) {
        console.error("Draft autosave error:", e);
      } finally {
        setIsSaving(false);
      }
    },
    [id]
  );

  // Update bundle and trigger debounce autosave
  const handleUpdateBundle = useCallback(
    (newBundle: AgentBundle) => {
      setBundle(newBundle);
      setHasUnsavedChanges(true);

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      // Debounce autosave after 2.5 seconds of inactivity
      autosaveTimeoutRef.current = setTimeout(() => {
        saveDraft(newBundle);
      }, 2500);
    },
    [saveDraft]
  );

  // Scroll to section when node clicked on graph
  const handleSelectSectionFromGraph = (sectionKey: string) => {
    setHighlightedSectionKey(sectionKey);
    const cardEl = document.getElementById(`section-card-${sectionKey}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      setHighlightedSectionKey((curr) => (curr === sectionKey ? null : curr));
    }, 2500);
  };

  // Publish with checklist validation
  const handlePublish = async () => {
    if (!bundle) return;

    // Run full schema validation
    const validation = validateAgentBundle(bundle);
    if (!validation.valid) {
      setValidationIssues(validation.errors);
      return;
    }

    setIsPublishing(true);
    setValidationIssues(null);

    try {
      // First save latest draft
      await saveDraft(bundle);

      // Call publish API
      const res = await fetch(`/api/agents/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeSummary: `Published bundle v2 with ${bundle.sections.length} sections`,
        }),
      });

      if (res.ok) {
        setPublishSuccess(true);
        setTimeout(() => setPublishSuccess(false), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to publish agent.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to publish agent.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Regenerate from description
  const handleRegenerateFromDescription = async () => {
    setShowRegenConfirm(false);
    setIsRegenerating(true);

    try {
      const res = await fetch(`/api/agents/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDescription: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.bundle) {
          setBundle(data.bundle);
          setHasUnsavedChanges(false);
          setLastSavedAt(new Date());
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Regeneration failed.");
      }
    } catch (err: any) {
      alert(err.message || "Regeneration failed.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Export JSON file
  const handleExportJson = () => {
    if (!bundle) return;
    const jsonStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.exported_from.employee_name.toLowerCase()}-bundle-v2.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON file
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const validation = validateAgentBundle(parsed);
        if (validation.valid && validation.bundle) {
          handleUpdateBundle(validation.bundle);
          setImportError(null);
        } else {
          setImportError(validation.errors);
        }
      } catch (err: any) {
        setImportError([`Malformed JSON file: ${err.message}`]);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Analyze variables for unused / missing
  const variableAnalysis = bundle
    ? analyzeBundleVariables(bundle)
    : { usedVars: new Set<string>(), definedVars: new Set<string>(), unusedVars: [], undefinedVars: [] };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-2" />
        <span className="text-sm font-medium">Loading script editor…</span>
      </div>
    );
  }

  if (loadError || !bundle) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 text-center">
        <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
        <h3 className="text-base font-bold text-red-800 dark:text-red-200">Unable to load agent</h3>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{loadError || "Agent not found"}</p>
        <Link href="/agents">
          <Button variant="outline" className="mt-4 text-xs">
            Return to Agents
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <Link
            href="/agents"
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 mb-1.5 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Voice Agents
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{bundle.exported_from.employee_name}</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Script Editor
              </span>
            </h1>

            {/* Autosave status indicator */}
            <div className="text-[11px] flex items-center gap-1 font-medium">
              {isSaving ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving draft…
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-slate-400">Unsaved changes…</span>
              ) : lastSavedAt ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Buttons Top Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Test in Browser */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsTestCallOpen(true)}
            className="text-xs border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 flex items-center gap-1.5"
          >
            <Headphones className="h-3.5 w-3.5 text-teal-600" />
            Test in Browser
          </Button>

          {/* Export JSON */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportJson}
            className="text-xs flex items-center gap-1.5"
            title="Export bundle JSON"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </Button>

          {/* Import JSON */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs flex items-center gap-1.5"
            title="Import bundle JSON"
          >
            <Upload className="h-3.5 w-3.5" />
            Import JSON
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJson}
            accept=".json,application/json"
            className="hidden"
          />

          {/* Regenerate from description */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRegenConfirm(true)}
            disabled={isRegenerating}
            className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
            title="Re-run AI generation from original description"
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>

          {/* Publish Button */}
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={isPublishing}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-9 px-4 flex items-center gap-1.5 shadow-sm"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : publishSuccess ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-900" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            <span>{publishSuccess ? "Published!" : "Publish Agent"}</span>
          </Button>
        </div>
      </div>

      {/* Main Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: Script Editor & Variables (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <ScriptEditor
            bundle={bundle}
            highlightedSectionKey={highlightedSectionKey}
            onUpdateBundle={handleUpdateBundle}
          />

          {/* Variables Panel */}
          <VariablesPanel
            variables={bundle.variables}
            unusedVariables={variableAnalysis.unusedVars}
            undefinedVariables={variableAnalysis.undefinedVars}
            onChangeVariables={(vars) => handleUpdateBundle({ ...bundle, variables: vars })}
          />
        </div>

        {/* RIGHT PANE: Flow Graph & Preview Tools (col-span-5 sticky) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-4">
          {/* Visual Node Flow Graph */}
          <FlowGraph
            bundle={bundle}
            selectedSectionKey={highlightedSectionKey}
            onSelectSection={handleSelectSectionFromGraph}
          />

          {/* AI Assist Box */}
          <AiAssistBox
            agentId={id}
            bundle={bundle}
            onApplyModifiedBundle={handleUpdateBundle}
          />
        </div>
      </div>

      {/* Sticky Bottom Footer for Manual Save & Status */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                hasUnsavedChanges
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {isSaving
                ? "Autosaving draft…"
                : hasUnsavedChanges
                ? "Unsaved edits in script"
                : "All edits saved as draft"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveDraft(bundle, true)}
              disabled={isSaving || !hasUnsavedChanges}
              className="text-xs flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save Draft Now
            </Button>

            <Button
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Rocket className="h-3.5 w-3.5" />
              Publish
            </Button>
          </div>
        </div>
      </div>

      {/* Test Call Modal */}
      <TestCallModal
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
        agentId={id}
        bundle={bundle}
      />

      {/* Validation Checklist Blocking Modal */}
      {validationIssues && (
        <Modal
          isOpen={true}
          onClose={() => setValidationIssues(null)}
          title="Publish Blocked: Validation Checklist"
          description="Your agent bundle has issues that must be fixed before publishing to ensure call safety."
          maxWidth="lg"
        >
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold">The following rules failed validation:</p>
              </div>
            </div>

            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {validationIssues.map((issue, idx) => (
                <li
                  key={idx}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200 flex items-start gap-2"
                >
                  <span className="text-red-500 font-bold shrink-0">✕</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setValidationIssues(null)} className="text-xs">
                Back to Editor to Fix
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Error Modal */}
      {importError && (
        <Modal
          isOpen={true}
          onClose={() => setImportError(null)}
          title="Import JSON Failed"
          description="The uploaded JSON file does not conform to the Agent Bundle v2 schema."
          maxWidth="md"
        >
          <div className="space-y-3 py-2 text-xs">
            <ul className="space-y-1.5 max-h-60 overflow-y-auto font-mono text-red-600 dark:text-red-400">
              {importError.map((err, i) => (
                <li key={i} className="p-2 bg-red-50 dark:bg-red-950/40 rounded border border-red-200">
                  {err}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => setImportError(null)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Regeneration Modal */}
      {showRegenConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setShowRegenConfirm(false)}
          title="Regenerate Agent Script?"
          description="Are you sure you want to regenerate this agent from its original business description? Any manual edits you made to sections or prompts will be overwritten."
          maxWidth="md"
        >
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowRegenConfirm(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleRegenerateFromDescription}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
            >
              Yes, Overwrite &amp; Regenerate
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
