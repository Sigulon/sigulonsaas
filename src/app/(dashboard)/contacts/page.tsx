"use client";

import { useEffect, useState, useCallback } from "react";
import { Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatPhoneNumber } from "@/lib/utils";
import {
  Users,
  Search,
  Plus,
  ShieldAlert,
  CheckCircle2,
  Phone,
  Loader2,
} from "lucide-react";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dnc, setDnc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchContacts = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(search)}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- benign mount-fetch idiom.
      fetchContacts(controller.signal);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchContacts]);

  const handleToggleDNC = async (contact: Contact) => {
    const newDnc = !contact.do_not_call;
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, do_not_call: newDnc }),
      });
      if (!res.ok) return;
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, do_not_call: newDnc } : c))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone_number: phoneNumber,
          do_not_call: dnc,
        }),
      });
      if (res.ok) {
        setIsAddOpen(false);
        setName("");
        setPhoneNumber("");
        setDnc(false);
        fetchContacts();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-violet-600" />
            Leads
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Your calling list — every contact your team can dial, with Do Not Call (DNC) compliance built in.
          </p>
        </div>

        <Button
          onClick={() => setIsAddOpen(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
        <Input
          placeholder="Search by name or number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      {/* Stat tiles */}
      {!loading && contacts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Total leads", value: contacts.length.toLocaleString() },
            { label: "Callable", value: contacts.filter((c) => !c.do_not_call).length.toLocaleString() },
            { label: "On DNC", value: contacts.filter((c) => c.do_not_call).length.toLocaleString() },
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-stone-200/70 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
              <span className="block text-lg font-bold leading-none text-stone-900 dark:text-white">{tile.value}</span>
              <span className="mt-1 block text-[11px] text-stone-500">{tile.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contacts Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950 shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-stone-400">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-2" />
            <span className="text-sm">Loading contacts...</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-xs">
            <Users className="mx-auto h-8 w-8 text-stone-300 mb-2" />
            <span>No leads yet. Add your first contact so your team has someone to call.</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50/70 text-stone-500 font-semibold dark:border-stone-800 dark:bg-stone-900/50">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Phone Number</th>
                <th className="px-5 py-3.5">DNC Compliance</th>
                <th className="px-5 py-3.5">Metadata</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-stone-50/80 dark:hover:bg-stone-900/50">
                  <td className="px-5 py-3.5 font-medium text-stone-900 dark:text-white">
                    {contact.name || "Unnamed Contact"}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-stone-700 dark:text-stone-300">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-stone-400" />
                      {formatPhoneNumber(contact.phone_number)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {contact.do_not_call ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <ShieldAlert className="h-3 w-3" />
                        Do Not Call
                      </Badge>
                    ) : (
                      <Badge variant="success" className="flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3 w-3" />
                        Callable
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-stone-500 font-mono text-[11px]">
                    {JSON.stringify(contact.metadata || {})}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleDNC(contact)}
                      className={`text-xs h-7 px-2.5 ${
                        contact.do_not_call
                          ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          : "border-rose-200 text-rose-600 hover:bg-rose-50"
                      }`}
                    >
                      {contact.do_not_call ? "Clear DNC" : "Mark as DNC"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Contact Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Single Contact"
        description="Add a recipient to your organization calling directory."
        maxWidth="md"
      >
        <form onSubmit={handleAddContact} className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              Contact Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              Phone Number (E.164)
            </label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+919876543210"
              required
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="dnc-check"
              checked={dnc}
              onChange={(e) => setDnc(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
            />
            <label htmlFor="dnc-check" className="text-xs text-stone-600 dark:text-stone-400">
              Register on Do Not Call (DNC) list immediately
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !phoneNumber}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {submitting ? "Saving..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
