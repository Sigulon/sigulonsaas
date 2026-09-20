"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CreditCard,
  Loader2,
  Settings as SettingsIcon,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BillingPage = dynamic(() => import("./billing/page"), {
  loading: () => <PanelLoading label="Loading billing and credit activity…" />,
});

const TeamPage = dynamic(() => import("./team/page"), {
  loading: () => <PanelLoading label="Loading team access…" />,
});

type SettingsSection = "account" | "billing" | "team";

type Organization = {
  id: string;
  name: string;
  role?: string;
  created_at?: string;
};

type Session = {
  user: {
    email: string;
    name?: string | null;
  } | null;
};

const sections: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "account",
    label: "Account",
    description: "Organization and profile details",
    icon: UserRound,
  },
  {
    id: "billing",
    label: "Billing & credits",
    description: "Balance, usage, and credit activity",
    icon: CreditCard,
  },
  {
    id: "team",
    label: "Team & access",
    description: "Members, roles, and invitations",
    icon: Users,
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-violet-600" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Manage your Sigulon account, voice credits, and organization access in one place.
        </p>
      </div>

      <div
        className="grid gap-2 rounded-[20px] border border-stone-200 bg-white p-2 sm:grid-cols-3 dark:border-stone-800 dark:bg-stone-950"
        role="tablist"
        aria-label="Settings sections"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg p-3 text-left transition-colors",
                isActive
                  ? "bg-violet-50 text-violet-950 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/50 dark:text-violet-100 dark:ring-violet-900"
                  : "text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-900"
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-content-center rounded-lg",
                  isActive ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-500 dark:bg-stone-900"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className="block text-xs text-stone-500 dark:text-stone-400">{section.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {activeSection === "account" && <AccountDetails />}
        {activeSection === "billing" && <BillingPage />}
        {activeSection === "team" && <TeamPage />}
      </div>
    </div>
  );
}

function AccountDetails() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        const [organizationsResponse, sessionResponse] = await Promise.all([
          fetch("/api/organizations"),
          fetch("/api/auth/session"),
        ]);

        if (!organizationsResponse.ok) {
          const data = await organizationsResponse.json().catch(() => ({}));
          throw new Error(data.error || "Could not load organization details.");
        }

        const organizationsData = await organizationsResponse.json();
        const organizations = (organizationsData.organizations ?? []) as Organization[];
        const activeOrganization = organizations.find(
          (item) => item.id === organizationsData.activeOrgId
        ) ?? organizations[0] ?? null;
        const sessionData = sessionResponse.ok ? await sessionResponse.json() : null;

        if (!cancelled) {
          setOrganization(activeOrganization);
          setSession(sessionData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load account details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  const createdAt = organization?.created_at
    ? new Date(organization.created_at).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "Not available";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-[20px] border border-stone-200 bg-white p-6 shadow-[0_8px_30px_rgba(30,20,60,0.08)] dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-content-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">Organization</h2>
              <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                Your active voice-operations workspace.
              </p>
            </div>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <Detail label="Workspace name" value={organization?.name} loading={loading} />
            <Detail label="Account role" value={organization?.role?.replace(/^./, (letter) => letter.toUpperCase())} loading={loading} />
            <Detail label="Workspace created" value={createdAt} loading={loading} />
          </dl>
        </section>

        <section className="rounded-[20px] border border-stone-200 bg-white p-6 shadow-[0_8px_30px_rgba(30,20,60,0.08)] dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-content-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">Profile & access</h2>
              <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                Your account identity and organization permissions.
              </p>
            </div>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <Detail label="Signed-in user" value={session?.user?.email ?? (loading ? undefined : "Not signed in — please log in")} loading={loading} />
            <Detail label="Access management" value="Manage members in Team & access" loading={false} />
            <Detail label="Credit management" value="Manage credits in Billing & credits" loading={false} />
          </dl>
        </section>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, loading }: { label: string; value?: string | null; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-3 last:border-0 last:pb-0 dark:border-stone-800">
      <dt className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-sm font-semibold text-stone-900 dark:text-white">
        {loading ? "Loading…" : value || "Not available"}
      </dd>
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-[20px] border border-stone-200 bg-white text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-600" />
      {label}
    </div>
  );
}
