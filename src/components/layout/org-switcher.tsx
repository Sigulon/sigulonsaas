"use client";

import { useState, useEffect, useRef } from "react";
import { Building2, Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export function OrgSwitcher() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchOrgs = async () => {
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setActiveOrgId(data.activeOrgId || "");
      }
    } catch (e) {
      console.error("Failed to load organizations:", e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
    fetchOrgs();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || {
    id: activeOrgId,
    name: "Acme Health & Wellness",
  };

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === activeOrgId) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    try {
      const res = await fetch("/api/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });

      if (res.ok) {
        setActiveOrgId(orgId);
        setIsOpen(false);
        // Refresh page so all active queries (agents, calls, campaigns) reload with the new org
        window.location.reload();
      }
    } catch (e) {
      console.error("Failed to switch organization:", e);
    } finally {
      setSwitching(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });

      if (res.ok) {
        await res.json();
        setIsCreateOpen(false);
        setNewOrgName("");
        // Reload into the newly created tenant
        window.location.reload();
      }
    } catch (e) {
      console.error("Failed to create organization:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 px-3 py-1.5 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80"
      >
        <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[140px] sm:max-w-[200px] truncate">
          {switching ? "Switching..." : activeOrg.name}
        </span>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          TENANT
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10 z-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Switch Organization
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 py-1">
            {organizations.map((org) => {
              const isSelected = org.id === activeOrgId;
              return (
                <button
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                    isSelected
                      ? "bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950/60 dark:text-indigo-300"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="truncate">{org.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-1 mt-1 dark:border-slate-800">
            <button
              onClick={() => {
                setIsOpen(false);
                setIsCreateOpen(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50/70 rounded-lg transition-colors dark:text-indigo-400 dark:hover:bg-indigo-950/40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Organization</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal for Creating New Organization */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Organization Tenant"
      >
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <p className="text-xs text-slate-500">
            Each organization functions as an isolated multi-tenant workspace with its own voice agents, campaigns, contacts, and call history.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Organization Name
            </label>
            <Input
              type="text"
              placeholder="e.g. Apex Dental Clinic, Sunrise Real Estate"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={loading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !newOrgName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs flex items-center gap-1.5"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Organization
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
