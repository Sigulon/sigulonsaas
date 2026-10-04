"use client";

import { useState, useRef } from "react";
import {
  AgentBundle,
  AgentBundleSection,
  AgentBundleVariable,
  AgentBundleEdge,
} from "@/lib/agent-bundle/schema";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  HelpCircle,
  AlertCircle,
  FileQuestion,
  CornerDownRight,
  Layers,
  Sparkles,
} from "lucide-react";

interface ScriptEditorProps {
  bundle: AgentBundle;
  highlightedSectionKey: string | null;
  onUpdateBundle: (updated: AgentBundle) => void;
}

const FAQ_MANDATORY_PREFIX =
  "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.";

interface FAQPair {
  id: string;
  question: string;
  answer: string;
}

function parseFaqPrompt(prompt: string): { faqs: FAQPair[]; closingExample: string } {
  const lines = prompt.split("\n");
  const faqs: FAQPair[] = [];
  let currentQ = "";
  let currentA = "";
  let closingExample = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Q:")) {
      if (currentQ && currentA) {
        faqs.push({
          id: Math.random().toString(36).substring(2, 9),
          question: currentQ,
          answer: currentA,
        });
        currentQ = "";
        currentA = "";
      }
      currentQ = trimmed.replace(/^Q:\s*/, "");
    } else if (trimmed.startsWith("A:")) {
      currentA = trimmed.replace(/^A:\s*/, "");
    } else if (trimmed.startsWith("For example you might say:")) {
      closingExample = trimmed;
    }
  }

  if (currentQ && currentA) {
    faqs.push({
      id: Math.random().toString(36).substring(2, 9),
      question: currentQ,
      answer: currentA,
    });
  }

  return { faqs, closingExample };
}

function serializeFaqPrompt(faqs: FAQPair[], closingExample?: string): string {
  const faqText = faqs
    .filter((f) => f.question.trim() && f.answer.trim())
    .map((f) => `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`)
    .join("\n\n");

  const exampleText = closingExample || "For example you might say: 'ఖచ్చితంగా అండి, పూర్తి వివరాలు మా దగ్గర ఉన్నాయి.'";
  return `${FAQ_MANDATORY_PREFIX}\n\n${faqText}\n\n${exampleText}`;
}

export function ScriptEditor({
  bundle,
  highlightedSectionKey,
  onUpdateBundle,
}: ScriptEditorProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Variable autocomplete state
  const [activePromptSectionKey, setActivePromptSectionKey] = useState<string | null>(null);
  const [showVariableDropdown, setShowVariableDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpdateFirstResponse = (val: string) => {
    onUpdateBundle({ ...bundle, first_response: val });
  };

  const handleInsertVariableInGreeting = (varKey: string) => {
    const placeholder = `{{${varKey}}}`;
    handleUpdateFirstResponse(`${bundle.first_response} ${placeholder}`);
  };

  // Section manipulation
  const handleUpdateSection = (sectionKey: string, updates: Partial<AgentBundleSection>) => {
    const updatedSections = bundle.sections.map((s) => {
      if (s.section_key === sectionKey) {
        return { ...s, ...updates };
      }
      return s;
    });
    onUpdateBundle({ ...bundle, sections: updatedSections });
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= bundle.sections.length) return;

    const sections = [...bundle.sections];
    const temp = sections[index];
    sections[index] = sections[targetIndex];
    sections[targetIndex] = temp;

    // Re-index orders sequentially 1..N
    sections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    onUpdateBundle({ ...bundle, sections });
  };

  const handleAddSection = () => {
    const count = bundle.sections.length;
    const newKey = `section_${count + 1}`;
    const newSection: AgentBundleSection = {
      section_key: newKey,
      label: `Section ${count + 1}`,
      order: count + 1,
      enabled: true,
      node_type: "llm",
      edges: [{ to_key: "close", condition: "once this section is complete" }],
      prompt: "State your question clearly. For example you might say: 'మీకు అనుకూలమైన సమయం చెప్పగలరా అండి?'",
    };

    // Insert right before 'faqs' and 'close' if present
    const closeIndex = bundle.sections.findIndex((s) => s.section_key === "close");
    const sections = [...bundle.sections];
    if (closeIndex >= 0) {
      sections.splice(closeIndex, 0, newSection);
    } else {
      sections.push(newSection);
    }

    sections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    onUpdateBundle({ ...bundle, sections });
  };

  const handleDeleteSection = (sectionKey: string) => {
    if (sectionKey === "faqs" || sectionKey === "close") {
      alert("The 'faqs' and 'close' sections are required by the call engine and cannot be deleted.");
      return;
    }

    // Check if other sections point to this section
    const referencingSections = bundle.sections.filter(
      (s) => s.section_key !== sectionKey && s.edges?.some((e) => e.to_key === sectionKey)
    );

    if (referencingSections.length > 0) {
      const names = referencingSections.map((s) => `'${s.label}'`).join(", ");
      const confirmRewire = window.confirm(
        `Section '${sectionKey}' is referenced by ${names}. Would you like to automatically rewire those transitions to 'close' and delete this section?`
      );
      if (!confirmRewire) return;

      // Rewire edges
      bundle.sections.forEach((s) => {
        if (s.edges) {
          s.edges.forEach((e) => {
            if (e.to_key === sectionKey) {
              e.to_key = "close";
            }
          });
        }
      });
    }

    const sections = bundle.sections.filter((s) => s.section_key !== sectionKey);
    sections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    onUpdateBundle({ ...bundle, sections });
  };

  // Edges manipulation
  const handleAddEdge = (sectionKey: string) => {
    const s = bundle.sections.find((sec) => sec.section_key === sectionKey);
    if (!s) return;

    const availableTargets = bundle.sections
      .map((sec) => sec.section_key)
      .filter((k) => k !== sectionKey);
    const defaultTarget = availableTargets[0] || "close";

    const currentEdges = s.edges ? [...s.edges] : [];
    currentEdges.push({
      to_key: defaultTarget,
      condition: "on caller response",
    });

    handleUpdateSection(sectionKey, { edges: currentEdges });
  };

  const handleUpdateEdge = (
    sectionKey: string,
    edgeIndex: number,
    updates: Partial<AgentBundleEdge>
  ) => {
    const s = bundle.sections.find((sec) => sec.section_key === sectionKey);
    if (!s || !s.edges) return;

    const updatedEdges = [...s.edges];
    updatedEdges[edgeIndex] = { ...updatedEdges[edgeIndex], ...updates };
    handleUpdateSection(sectionKey, { edges: updatedEdges });
  };

  const handleRemoveEdge = (sectionKey: string, edgeIndex: number) => {
    const s = bundle.sections.find((sec) => sec.section_key === sectionKey);
    if (!s || !s.edges) return;

    const updatedEdges = s.edges.filter((_, idx) => idx !== edgeIndex);
    handleUpdateSection(sectionKey, { edges: updatedEdges });
  };

  // Autocomplete helper for {{
  const handlePromptChange = (sectionKey: string, value: string, cursorPos: number) => {
    handleUpdateSection(sectionKey, { prompt: value });
    const textBeforeCursor = value.slice(0, cursorPos);
    if (textBeforeCursor.endsWith("{{")) {
      setActivePromptSectionKey(sectionKey);
      setCursorPosition(cursorPos);
      setShowVariableDropdown(true);
    } else {
      setShowVariableDropdown(false);
    }
  };

  const insertVariableAtCursor = (sectionKey: string, varKey: string) => {
    const s = bundle.sections.find((sec) => sec.section_key === sectionKey);
    if (!s) return;

    const prompt = s.prompt;
    const before = prompt.slice(0, cursorPosition);
    const after = prompt.slice(cursorPosition);
    const newPrompt = `${before}${varKey}}}${after}`;
    handleUpdateSection(sectionKey, { prompt: newPrompt });
    setShowVariableDropdown(false);
  };

  const definedVarKeys = new Set(bundle.variables.map((v) => v.key));

  return (
    <div className="space-y-6">
      {/* Top Persona & Opening Greeting Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
              Agent Identity &amp; Mode
            </span>
            <div className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
              <span>{bundle.exported_from.employee_name}</span>
              <span className="text-xs font-normal text-slate-400">
                — {bundle.exported_from.employee_role}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              MODE: {bundle.exported_from.mode.toUpperCase()}
            </span>
            <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-semibold">
              {bundle.exported_from.language}
            </span>
          </div>
        </div>

        {/* First response editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>Opening Utterance (first_response)</span>
              <span className="text-[11px] text-slate-400 font-normal">
                — Spoken immediately when call connects
              </span>
            </label>
          </div>

          <textarea
            rows={2}
            value={bundle.first_response}
            onChange={(e) => handleUpdateFirstResponse(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 font-medium leading-relaxed"
            style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
          />

          {/* Quick variable chips for greeting */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 font-medium">Insert variable:</span>
            {bundle.variables.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => handleInsertVariableInGreeting(v.key)}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-amber-100 hover:text-amber-800 dark:bg-slate-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 transition-colors"
              >
                + {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sections List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-600" />
              <span>Conversation Sections &amp; Routing</span>
              <span className="text-xs font-mono text-slate-400 font-normal">
                ({bundle.sections.length} nodes)
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Each section is executed as an LLM node with natural-language edge conditions.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleAddSection}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Section
          </Button>
        </div>

        {/* Section Cards */}
        <div className="space-y-3">
          {bundle.sections.map((section, idx) => {
            const isHighlighted = highlightedSectionKey === section.section_key;
            const isCollapsed = Boolean(collapsedSections[section.section_key]);
            const isFaq = section.section_key === "faqs";
            const isTerminal = section.edges === null;

            return (
              <div
                key={section.section_key}
                id={`section-card-${section.section_key}`}
                className={`rounded-xl border transition-all duration-200 bg-white dark:bg-slate-900 overflow-hidden shadow-sm ${
                  isHighlighted
                    ? "border-amber-500 ring-2 ring-amber-400/40 shadow-lg scale-[1.005]"
                    : "border-slate-200 dark:border-slate-800"
                } ${!section.enabled ? "opacity-60" : ""}`}
              >
                {/* Section Header Bar */}
                <div className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {/* Reorder controls */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveSection(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSection(idx, "down")}
                        disabled={idx === bundle.sections.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                      #{section.order}
                    </span>

                    <input
                      type="text"
                      value={section.label}
                      onChange={(e) =>
                        handleUpdateSection(section.section_key, { label: e.target.value })
                      }
                      className="text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none truncate max-w-[200px]"
                    />

                    <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                      ({section.section_key})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Enabled toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-slate-500">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={(e) =>
                          handleUpdateSection(section.section_key, { enabled: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span>Enabled</span>
                    </label>

                    {/* Delete section */}
                    {section.section_key !== "faqs" && section.section_key !== "close" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(section.section_key)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Collapse toggle */}
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse(section.section_key)}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Section Body */}
                {!isCollapsed && (
                  <div className="p-4 space-y-4">
                    {/* SPECIAL FAQS EDITOR */}
                    {isFaq ? (
                      <FaqSectionEditor
                        section={section}
                        onUpdatePrompt={(prompt) =>
                          handleUpdateSection(section.section_key, { prompt })
                        }
                      />
                    ) : (
                      /* STANDARD PROMPT EDITOR */
                      <div className="space-y-1.5 relative">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Node Prompt Instruction &amp; Sample Line
                          </label>
                          <span className="text-[10px] text-slate-400">
                            Must end with &quot;For example you might say: &apos;...&apos;&quot;
                          </span>
                        </div>

                        <textarea
                          rows={4}
                          value={section.prompt}
                          onChange={(e) =>
                            handlePromptChange(
                              section.section_key,
                              e.target.value,
                              e.target.selectionStart
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500 leading-relaxed"
                          style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
                        />

                        {/* Autocomplete variable suggestions popup */}
                        {showVariableDropdown && activePromptSectionKey === section.section_key && (
                          <div className="absolute left-4 top-14 z-20 w-64 rounded-xl border border-amber-300 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-amber-600 block px-1">
                              Insert Variable
                            </span>
                            {bundle.variables.map((v) => (
                              <button
                                key={v.key}
                                type="button"
                                onClick={() => insertVariableAtCursor(section.section_key, v.key)}
                                className="w-full text-left px-2 py-1 rounded text-xs hover:bg-amber-50 dark:hover:bg-slate-800 flex items-center justify-between font-mono"
                              >
                                <span>{v.key}</span>
                                <span className="text-[10px] text-slate-400">{v.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* EDGES EDITOR */}
                    {!isTerminal && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <CornerDownRight className="h-3 w-3 text-teal-600" />
                            Next Transitions (Edges)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddEdge(section.section_key)}
                            className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Add Transition
                          </button>
                        </div>

                        {section.edges && section.edges.length > 0 ? (
                          <div className="space-y-2">
                            {section.edges.map((edge, edgeIdx) => (
                              <div
                                key={edgeIdx}
                                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs"
                              >
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <ArrowRight className="h-3.5 w-3.5 text-teal-600" />
                                  <span className="text-[11px] text-slate-500 font-medium">To:</span>
                                  <select
                                    value={edge.to_key}
                                    onChange={(e) =>
                                      handleUpdateEdge(section.section_key, edgeIdx, {
                                        to_key: e.target.value,
                                      })
                                    }
                                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono font-semibold"
                                  >
                                    {bundle.sections
                                      .map((sec) => sec.section_key)
                                      .filter((k) => k !== section.section_key)
                                      .map((targetKey) => (
                                        <option key={targetKey} value={targetKey}>
                                          {targetKey}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="flex-1 flex items-center gap-2">
                                  <span className="text-[11px] text-slate-500 font-medium shrink-0">
                                    When:
                                  </span>
                                  <input
                                    type="text"
                                    value={edge.condition}
                                    onChange={(e) =>
                                      handleUpdateEdge(section.section_key, edgeIdx, {
                                        condition: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. if customer confirms plot budget"
                                    className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:border-teal-500"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveEdge(section.section_key, edgeIdx)}
                                  className="text-slate-400 hover:text-red-500 p-1"
                                  title="Remove transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            No transitions added. Add at least one transition or mark as terminal.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Friendly FAQs Editor with Q/A row pairs
function FaqSectionEditor({
  section,
  onUpdatePrompt,
}: {
  section: AgentBundleSection;
  onUpdatePrompt: (prompt: string) => void;
}) {
  const { faqs: initialFaqs, closingExample } = parseFaqPrompt(section.prompt);
  const [faqs, setFaqs] = useState<FAQPair[]>(initialFaqs);

  const handleFaqChange = (id: string, field: "question" | "answer", value: string) => {
    const updated = faqs.map((f) => (f.id === id ? { ...f, [field]: value } : f));
    setFaqs(updated);
    onUpdatePrompt(serializeFaqPrompt(updated, closingExample));
  };

  const handleAddFaq = () => {
    const updated = [
      ...faqs,
      {
        id: Math.random().toString(36).substring(2, 9),
        question: "కొత్త ప్రశ్న?",
        answer: "సమాధానం ఇక్కడ టైప్ చేయండి.",
      },
    ];
    setFaqs(updated);
    onUpdatePrompt(serializeFaqPrompt(updated, closingExample));
  };

  const handleRemoveFaq = (id: string) => {
    const updated = faqs.filter((f) => f.id !== id);
    setFaqs(updated);
    onUpdatePrompt(serializeFaqPrompt(updated, closingExample));
  };

  return (
    <div className="space-y-3">
      <div className="p-2.5 rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 text-xs">
        <span className="font-bold">Required FAQs Safeguard: </span>
        <span>
          Answer ONLY from what&apos;s written here; if a question isn&apos;t listed, the agent will use its don&apos;t-know response.
        </span>
      </div>

      <div className="space-y-2">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Q: Question
              </span>
              <button
                type="button"
                onClick={() => handleRemoveFaq(faq.id)}
                className="text-slate-400 hover:text-red-500 p-1"
                title="Remove FAQ"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <input
              type="text"
              value={faq.question}
              onChange={(e) => handleFaqChange(faq.id, "question", e.target.value)}
              placeholder="e.g. జీరో డెప్రిసియేషన్ కవర్ ఉందా?"
              className="w-full rounded border px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 focus:outline-none"
              style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
            />

            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
              A: Verified Answer
            </span>
            <input
              type="text"
              value={faq.answer}
              onChange={(e) => handleFaqChange(faq.id, "answer", e.target.value)}
              placeholder="e.g. అవునండి, బంపర్ టు బంపర్ జీరో డెప్ కవరేజ్ అందుబాటులో ఉంది."
              className="w-full rounded border px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 focus:outline-none"
              style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
            />
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddFaq}
          className="text-xs flex items-center gap-1.5 w-full mt-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add Q/A Pair
        </Button>
      </div>
    </div>
  );
}
