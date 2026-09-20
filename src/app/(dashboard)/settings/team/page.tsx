"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { UserPlus, Users, CheckCircle2 } from "lucide-react";

interface Member {
  user_id: string;
  email: string;
  role: string;
}

const MANAGE_ROLES = new Set(["owner", "admin"]);

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [yourRole, setYourRole] = useState("member");
  const [yourUserId, setYourUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [invitedSuccess, setInvitedSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Key-driven refetch: the effect below owns all fetching (rule-clean);
  // event handlers bump the key instead of calling fetchers directly.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organizations/members");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load team");
        if (cancelled) return;
        setMembers(data.members || []);
        setYourRole(data.your_role || "member");
        setYourUserId(data.your_user_id || "");
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load team");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = () => {
    setLoading(true);
    setActionError(null);
    setRefreshKey((k) => k + 1);
  };

  const canManage = MANAGE_ROLES.has(yourRole);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setActionError(null);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");
      setInvitedSuccess(true);
      setTimeout(() => {
        setInvitedSuccess(false);
        setIsInviteOpen(false);
        setEmail("");
        refresh();
      }, 1200);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionError(null);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Role change failed");
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Role change failed");
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this member from the organization?")) return;
    setActionError(null);
    try {
      const res = await fetch(
        `/api/organizations/members?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-violet-600" />
            Team Members & Access
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Invite colleagues to create voice agents, launch campaigns, and analyze transcripts.
          </p>
        </div>

        {canManage && (
          <Button
            onClick={() => setIsInviteOpen(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            Invite Colleague
          </Button>
        )}
      </div>

      {(error || actionError) && (
        <Card className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30">
          <CardContent className="p-4 text-xs text-rose-700 dark:text-rose-300">
            {error || actionError}
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950 shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-stone-200 bg-stone-50 p-2 font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-900">
            <tr>
              <th className="p-3.5">User</th>
              <th className="p-3.5">Role</th>
              <th className="p-3.5">Access Level</th>
              {canManage && <th className="p-3.5 text-right">Manage</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {loading && (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="p-3.5 text-stone-500">
                  Loading team…
                </td>
              </tr>
            )}
            {!loading &&
              members.map((member) => (
                <tr key={member.user_id} className="hover:bg-stone-50/80 dark:hover:bg-stone-900/50">
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950 font-semibold text-violet-700 dark:text-violet-300">
                        {(member.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-semibold text-stone-900 dark:text-white block">
                          {member.email || member.user_id.slice(0, 8)}
                          {member.user_id === yourUserId && (
                            <span className="ml-2 text-[10px] font-normal text-stone-400">(you)</span>
                          )}
                        </span>
                        <span className="text-stone-400 text-[11px] font-mono">
                          {member.user_id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 capitalize font-medium text-stone-700 dark:text-stone-300">
                    {canManage && member.user_id !== yourUserId ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                        className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900"
                      >
                        <option value="viewer">VIEWER</option>
                        <option value="member">MEMBER</option>
                        <option value="admin">ADMIN</option>
                        <option value="owner">OWNER</option>
                      </select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "owner"
                            ? "default"
                            : member.role === "admin"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {member.role.toUpperCase()}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3.5 text-stone-400">
                    {member.role === "owner"
                      ? "Full Tenant Admin"
                      : member.role === "admin"
                      ? "Billing & Agent Ops"
                      : member.role === "viewer"
                      ? "Read Only"
                      : "Read & Dialing"}
                  </td>
                  {canManage && (
                    <td className="p-3.5 text-right">
                      {member.user_id !== yourUserId && (
                        <button
                          onClick={() => handleRemove(member.user_id)}
                          className="text-xs font-medium text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite Team Member"
        description="Send an email invitation to grant access to your organization."
        maxWidth="md"
      >
        <form onSubmit={handleInvite} className="space-y-4 py-2">
          {invitedSuccess ? (
            <div className="py-6 text-center text-emerald-600 space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8" />
              <span className="font-medium text-sm block">Invitation Dispatched!</span>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Assigned Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                >
                  <option value="viewer">Viewer (Read only)</option>
                  <option value="member">Member (Create & run campaigns)</option>
                  <option value="admin">Admin (Manage billing, keys, and phone numbers)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white">
                  Send Invite
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
