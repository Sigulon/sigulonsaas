"use client";

import { useState } from "react";
import { AgentBundleVariable } from "@/lib/agent-bundle/schema";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  Phone,
  User,
  Hash,
  HelpCircle,
  X,
} from "lucide-react";

interface VariablesPanelProps {
  variables: AgentBundleVariable[];
  unusedVariables: string[];
  undefinedVariables: string[];
  onChangeVariables: (vars: AgentBundleVariable[]) => void;
}

export function VariablesPanel({
  variables,
  unusedVariables,
  undefinedVariables,
  onChangeVariables,
}: VariablesPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSource, setNewSource] = useState<"pre" | "capture">("capture");
  const [newType, setNewType] = useState<"text" | "number" | "date" | "boolean" | "choice">("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newExtractHint, setNewExtractHint] = useState("");
  const [newChoices, setNewChoices] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!cleanKey) {
      setError("Variable key is required.");
      return;
    }

    if (variables.some((v) => v.key === cleanKey)) {
      setError(`Variable '${cleanKey}' already exists.`);
      return;
    }

    const cleanLabel = newLabel.trim() || cleanKey;
    const choicesArray =
      newType === "choice" && newChoices.trim()
        ? newChoices.split(",").map((c) => c.trim()).filter(Boolean)
        : null;

    const newVar: AgentBundleVariable = {
      key: cleanKey,
      label: cleanLabel,
      source: newSource,
      required: newRequired,
      value_type: newType,
      extract_hint: newExtractHint.trim() || null,
      is_phone: false,
      is_lead_name: false,
      is_headline: false,
      choices: choicesArray,
    };

    onChangeVariables([...variables, newVar]);
    setIsAdding(false);
    setNewKey("");
    setNewLabel("");
    setNewExtractHint("");
    setNewChoices("");
    setError(null);
  };

  const handleDeleteVariable = (keyToDelete: string) => {
    if (keyToDelete === "phone" || keyToDelete === "lead_name") {
      alert("System variables 'phone' and 'lead_name' cannot be removed.");
      return;
    }
    onChangeVariables(variables.filter((v) => v.key !== keyToDelete));
  };

  const handleToggleRequired = (key: string) => {
    if (key === "phone") return; // Phone is always required
    onChangeVariables(
      variables.map((v) => (v.key === key ? { ...v, required: !v.required } : v))
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Call Variables</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {variables.length} defined
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Type <code className="text-amber-600 dark:text-amber-400 font-bold font-mono">{"{{"}</code> in any section prompt to insert variables.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsAdding(true)}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Variable
        </Button>
      </div>

      {/* Warnings Banner for Unused or Undefined Variables */}
      {(undefinedVariables.length > 0 || unusedVariables.length > 0) && (
        <div className="space-y-1.5">
          {undefinedVariables.length > 0 && (
            <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
              <div>
                <span className="font-bold">Missing Variables: </span>
                {undefinedVariables.map((v) => (
                  <code key={v} className="bg-red-100 dark:bg-red-900/60 px-1 py-0.5 rounded font-mono mr-1">
                    {`{{${v}}}`}
                  </code>
                ))}
                is used in prompts but not defined in the table below.
              </div>
            </div>
          )}

          {unusedVariables.length > 0 && (
            <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <span className="font-semibold">Unused Variables: </span>
                {unusedVariables.map((v) => (
                  <code key={v} className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono mr-1">
                    {v}
                  </code>
                ))}
                is defined but never referenced in any section prompt or greeting.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variables Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Variable Key</th>
              <th className="py-2.5 px-3">Label</th>
              <th className="py-2.5 px-3">Source</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Required</th>
              <th className="py-2.5 px-3">Extraction Guidance</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {variables.map((v) => (
              <tr key={v.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  {v.is_phone ? (
                    <Phone className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : v.is_lead_name ? (
                    <User className="h-3 w-3 text-amber-500 shrink-0" />
                  ) : (
                    <Hash className="h-3 w-3 text-slate-400 shrink-0" />
                  )}
                  <span>{v.key}</span>
                </td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">
                  {v.label}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      v.source === "pre"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                    }`}
                  >
                    {v.source === "pre" ? "PRE-LOAD" : "CAPTURE"}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                  {v.value_type}
                  {v.choices?.length ? ` (${v.choices.length} choices)` : ""}
                </td>
                <td className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleToggleRequired(v.key)}
                    disabled={v.is_phone}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                      v.required
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}
                  >
                    {v.required ? "Required" : "Optional"}
                  </button>
                </td>
                <td className="py-2 px-3 text-[11px] text-slate-400 max-w-[200px] truncate">
                  {v.extract_hint || "—"}
                </td>
                <td className="py-2 px-3 text-right">
                  {v.key !== "phone" && v.key !== "lead_name" ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteVariable(v.key)}
                      className="text-slate-400 hover:text-red-500 p-1 rounded"
                      title="Delete variable"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">System</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Variable Modal / Form */}
      {isAdding && (
        <form
          onSubmit={handleAddVariable}
          className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">Add New Variable</span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold mb-1">Key (snake_case)</label>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. loan_amount"
                required
                className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Display Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Loan Amount"
                className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Source</label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value as any)}
                className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-900 focus:outline-none"
              >
                <option value="capture">Capture (Extracted in call)</option>
                <option value="pre">Pre-call (From Lead List)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1">Value Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="w-full rounded border px-2.5 py-1.5 bg-white dark:bg-slate-900 focus:outline-none"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="boolean">Boolean (Yes/No)</option>
                <option value="choice">Choice</option>
              </select>
            </div>
          </div>

          {newType === "choice" && (
            <div>
              <label className="block text-[11px] font-semibold mb-1">
                Comma-separated Choices (e.g. High, Medium, Low)
              </label>
              <input
                type="text"
                value={newChoices}
                onChange={(e) => setNewChoices(e.target.value)}
                placeholder="Option A, Option B, Option C"
                className="w-full rounded border px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold mb-1">
              Extraction Guidance Hint (Optional)
            </label>
            <input
              type="text"
              value={newExtractHint}
              onChange={(e) => setNewExtractHint(e.target.value)}
              placeholder="e.g. Capture whether the caller has an existing loan"
              className="w-full rounded border px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded"
              />
              <span>Mark as required field</span>
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAdding(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
              >
                Save Variable
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
