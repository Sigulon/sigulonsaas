"use client";

import { useMemo, useState } from "react";
import { AgentBundle, AgentBundleSection } from "@/lib/agent-bundle/schema";
import { Sparkles, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

interface FlowGraphProps {
  bundle: AgentBundle;
  selectedSectionKey: string | null;
  onSelectSection: (sectionKey: string) => void;
}

export function FlowGraph({ bundle, selectedSectionKey, onSelectSection }: FlowGraphProps) {
  const [scale, setScale] = useState(1);

  // Layout calculation for DAG/sequential nodes
  const layout = useMemo(() => {
    const sections = [...bundle.sections].sort((a, b) => a.order - b.order);
    const nodeWidth = 220;
    const nodeHeight = 84;
    const verticalGap = 44;
    const startX = 60;
    const startY = 30;

    const nodes = sections.map((sec, idx) => {
      // Offset FAQs to a parallel branch on the right for cleaner layout
      const isFaq = sec.section_key === "faqs";
      const x = isFaq ? startX + nodeWidth + 60 : startX;
      const y = isFaq ? startY + (nodeHeight + verticalGap) * 1.5 : startY + idx * (nodeHeight + verticalGap);

      return {
        key: sec.section_key,
        label: sec.label,
        order: sec.order,
        enabled: sec.enabled,
        isEntry: idx === 0,
        isTerminal: sec.edges === null || sec.section_key === "close",
        isFaq,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        edges: sec.edges || [],
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.key, n]));

    // Construct edge lines
    const lines: Array<{
      fromKey: string;
      toKey: string;
      condition: string;
      path: string;
      midX: number;
      midY: number;
    }> = [];

    nodes.forEach((n) => {
      n.edges.forEach((e) => {
        const target = nodeMap.get(e.to_key);
        if (!target) return;

        const x1 = n.x + n.width / 2;
        const y1 = n.y + n.height;
        const x2 = target.x + target.width / 2;
        const y2 = target.y;

        let path = "";
        let midX = (x1 + x2) / 2;
        let midY = (y1 + y2) / 2;

        if (n.x === target.x) {
          // Direct vertical connection
          path = `M ${x1} ${y1} L ${x2} ${y2}`;
        } else {
          // Curved connector
          const dx = x2 - x1;
          const dy = y2 - y1;
          const cx1 = x1;
          const cy1 = y1 + dy * 0.5;
          const cx2 = x2;
          const cy2 = y2 - dy * 0.5;
          path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
          midX = (cx1 + cx2) / 2;
          midY = (cy1 + cy2) / 2;
        }

        lines.push({
          fromKey: n.key,
          toKey: e.to_key,
          condition: e.condition,
          path,
          midX,
          midY,
        });
      });
    });

    const totalHeight = Math.max(500, (sections.length + 1) * (nodeHeight + verticalGap));
    const totalWidth = startX + nodeWidth * 2 + 140;

    return { nodes, lines, totalWidth, totalHeight };
  }, [bundle]);

  return (
    <div className="relative w-full h-[520px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/80 overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-between z-10">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Call Flow Graph
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.4, s + 0.1))}
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white ml-1"
            title="Reset view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="flex-1 overflow-auto p-4 cursor-grab active:cursor-grabbing">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: layout.totalWidth,
            height: layout.totalHeight,
            position: "relative",
          }}
        >
          {/* SVG Arrowhead definitions and lines */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={layout.totalWidth}
            height={layout.totalHeight}
          >
            <defs>
              <marker
                id="graph-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#0d9488" />
              </marker>
              <marker
                id="graph-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#f59e0b" />
              </marker>
            </defs>

            {layout.lines.map((line, idx) => {
              const isSelected =
                selectedSectionKey === line.fromKey || selectedSectionKey === line.toKey;
              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={line.path}
                    fill="none"
                    stroke={isSelected ? "#f59e0b" : "#0d9488"}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                    strokeDasharray={isSelected ? "none" : "none"}
                    markerEnd={isSelected ? "url(#graph-arrow-active)" : "url(#graph-arrow)"}
                    className="transition-all duration-150"
                  />
                </g>
              );
            })}
          </svg>

          {/* Render Nodes */}
          {layout.nodes.map((node) => {
            const isSelected = selectedSectionKey === node.key;

            return (
              <div
                key={node.key}
                onClick={() => onSelectSection(node.key)}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                className={`rounded-xl border p-3 cursor-pointer transition-all duration-200 select-none shadow-sm ${
                  isSelected
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-400/50 shadow-md transform scale-[1.02]"
                    : node.isEntry
                    ? "border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 hover:border-amber-400"
                    : node.isTerminal
                    ? "border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:border-emerald-400"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-400"
                } ${!node.enabled ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      node.isEntry
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                        : node.isTerminal
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    #{node.order} {node.isEntry ? "ENTRY" : node.isTerminal ? "END" : ""}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">
                    {node.key}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {node.label}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                  <span>{node.edges.length} {node.edges.length === 1 ? "route" : "routes"}</span>
                  {node.isFaq && <span className="text-teal-600 font-semibold">FAQs</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
