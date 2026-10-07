"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  Plus,
  Check,
  Search,
  Globe,
  Settings,
  ShieldCheck,
  Building2,
  X,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneNumber, Agent } from "@/lib/types/sigulon";
import { getPhoneNumbers, buyPhoneNumber, updateNumberRouting } from "@/lib/api/phone-numbers";
import { getAgents } from "@/lib/api/agents";

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState("Bangalore");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const loadNumbers = async () => {
    setIsLoading(true);
    try {
      const data = await getPhoneNumbers();
      setNumbers(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNumbers();
    async function loadAgents() {
      try {
        const ags = await getAgents();
        setAgentsList(ags);
        if (ags.length > 0) {
          setSelectedAgentId((prev) => prev || ags[0].id);
        }
      } catch (err) {
        console.error("[phone-numbers] Error loading agents:", err);
      }
    }
    loadAgents();
  }, []);

  const handleBuy = async () => {
    setIsPurchasing(true);
    try {
      const agent = agentsList.find((a) => a.id === selectedAgentId);
      await buyPhoneNumber({
        city: selectedCity,
        assignedAgentId: agent?.id,
        assignedAgentName: agent?.name,
      });
      setIsBuyModalOpen(false);
      loadNumbers();
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleReassign = async (phoneId: string, agentId: string) => {
    const ag = agentsList.find((a) => a.id === agentId);
    if (!ag) return;
    await updateNumberRouting(phoneId, ag.id, ag.name);
    loadNumbers();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Phone numbers
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
            Manage virtual phone numbers and SIP trunks for outbound caller ID and inbound routing.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsBuyModalOpen(true)}
          className="gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Buy number</span>
        </Button>
      </div>

      {/* Numbers Table */}
      <Card className="border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-500 bg-gray-50/50 dark:bg-neutral-850">
                <th className="py-3 px-5">Phone Number</th>
                <th className="py-3 px-3">City / Circle</th>
                <th className="py-3 px-3">Provider</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3 font-mono">Calls Handled</th>
                <th className="py-3 px-3 font-mono">Minutes</th>
                <th className="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {numbers.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/70 dark:hover:bg-neutral-800/40">
                  <td className="py-3.5 px-5">
                    <div className="font-mono font-semibold text-gray-900 dark:text-white">
                      {item.number}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                      ₹{item.monthlyRentalInr}/mo rental
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-medium text-gray-800 dark:text-neutral-200">
                    {item.city}, {item.country}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 font-mono text-[11px]">
                      {item.provider} SIP
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <select
                      value={item.assignedAgentId || ""}
                      onChange={(e) => handleReassign(item.id, e.target.value)}
                      className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-medium text-blue-600 focus:outline-none"
                    >
                      {agentsList.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name} ({ag.language})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3.5 px-3 capitalize text-gray-600 dark:text-neutral-300">
                    {item.type.replace("_", " ")}
                  </td>
                  <td className="py-3.5 px-3 font-mono">{item.callsHandled}</td>
                  <td className="py-3.5 px-3 font-mono">{item.minutesUsed} min</td>
                  <td className="py-3.5 px-3">
                    <Badge variant="success" className="capitalize">
                      {item.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Buy Number Modal */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-base text-gray-900 dark:text-white">
                  Buy Virtual DID Number
                </h3>
              </div>
              <button
                onClick={() => setIsBuyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Select Telecom Circle / City</label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-neutral-900 text-sm"
                >
                  <option value="Bangalore">Bangalore (+91 80)</option>
                  <option value="Hyderabad">Hyderabad (+91 40)</option>
                  <option value="Mumbai">Mumbai (+91 22)</option>
                  <option value="Delhi">Delhi (+91 11)</option>
                  <option value="Chennai">Chennai (+91 44)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Assign to Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-neutral-900 text-sm"
                >
                  {agentsList.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-neutral-850 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-semibold block text-gray-900 dark:text-white">
                    Monthly Rental:
                  </span>
                  <span className="text-gray-400 text-[11px]">Billed from credits balance</span>
                </div>
                <span className="font-mono font-bold text-sm text-gray-900 dark:text-white">
                  ₹499 / month
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsBuyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBuy}
                disabled={isPurchasing}
                className="min-w-28"
              >
                {isPurchasing ? "Provisioning..." : "Buy & Activate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
