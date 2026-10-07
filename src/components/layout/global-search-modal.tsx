"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bot,
  Megaphone,
  User,
  Zap,
  ArrowRight,
  X,
  CreditCard,
  Phone,
  Settings,
} from "lucide-react";
import { getAgents } from "@/lib/api/agents";
import { getCampaigns } from "@/lib/api/campaigns";
import { getLeads } from "@/lib/api/leads";
import { Agent, Campaign, Lead } from "@/lib/types/sigulon";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    async function loadData() {
      try {
        const [a, c, l] = await Promise.all([
          getAgents(),
          getCampaigns(),
          getLeads(),
        ]);
        setAgents(a);
        setCampaigns(c);
        setLeads(l);
      } catch (err) {
        console.error("[search] Error loading search data:", err);
      }
    }
    loadData();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // toggle modal
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const filteredAgents = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          a.language.toLowerCase().includes(q)
      )
    : agents;

  const filteredCampaigns = q
    ? campaigns.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.agentName.toLowerCase().includes(q)
      )
    : campaigns.slice(0, 3);

  const filteredLeads = q
    ? leads.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.city && l.city.toLowerCase().includes(q))
      )
    : leads.slice(0, 3);

  const handleNavigate = (url: string) => {
    router.push(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, campaigns, leads, or jump to page..."
            className="w-full text-sm bg-transparent border-none text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-neutral-800 rounded border border-gray-200 dark:border-neutral-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4 divide-y divide-gray-100 dark:divide-neutral-800">
          {/* Agents */}
          {filteredAgents.length > 0 && (
            <div className="pt-2">
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                AI Voice Agents
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleNavigate(`/agents/${agent.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800/70 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold text-xs">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {agent.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-neutral-400">
                          {agent.role} · {agent.language}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Campaigns */}
          {filteredCampaigns.length > 0 && (
            <div className="pt-2">
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Campaigns
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredCampaigns.map((camp) => (
                  <button
                    key={camp.id}
                    onClick={() => handleNavigate(`/calling/campaigns`)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800/70 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Megaphone className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {camp.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-neutral-400">
                          {camp.leadsCount} leads · Agent: {camp.agentName}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Leads */}
          {filteredLeads.length > 0 && (
            <div className="pt-2">
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Leads & Results
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleNavigate(`/results?leadId=${lead.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800/70 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {lead.name}
                        </div>
                        <div className="text-xs font-mono text-gray-500 dark:text-neutral-400">
                          {lead.phone} · {lead.city || "India"}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium capitalize">
                      {lead.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Page Jumps */}
          <div className="pt-2">
            <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Quick Jumps
            </div>
            <div className="grid grid-cols-2 gap-1 p-1">
              <button
                onClick={() => handleNavigate("/calling/instant")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                <Zap className="w-3.5 h-3.5 text-blue-600" /> Instant Lead Call
              </button>
              <button
                onClick={() => handleNavigate("/talk")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                <Bot className="w-3.5 h-3.5 text-blue-600" /> Talk to an Agent
              </button>
              <button
                onClick={() => handleNavigate("/phone-numbers")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                <Phone className="w-3.5 h-3.5 text-blue-600" /> Phone Numbers
              </button>
              <button
                onClick={() => handleNavigate("/billing")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Billing & Usage
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
