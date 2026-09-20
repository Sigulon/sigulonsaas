"use client";

import { useSyncExternalStore, useState, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  ChevronDown,
  ChevronsRight,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Radio,
  Settings,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TestCallDialog } from "@/components/agents/test-call-dialog";

type NavigationItem = {
  icon: LucideIcon;
  label: string;
  badge?: string;
  href?: string;
  action?: "test-call";
};

const overview: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
];

const yourTeam: NavigationItem[] = [
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/agents/builder", icon: Sparkles, label: "New agent" },
  { icon: PhoneCall, label: "Test call", action: "test-call" },
];

const calling: NavigationItem[] = [
  { icon: Zap, label: "Instant dial", action: "test-call" },
  { href: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { href: "/phone-numbers?direction=inbound", icon: PhoneIncoming, label: "Inbound" },
];

const resultsAndSetup: NavigationItem[] = [
  { href: "/contacts", icon: Users, label: "Leads" },
  { href: "/calls", icon: PhoneCall, label: "Conversations" },
  { href: "/phone-numbers", icon: Phone, label: "Numbers" },
  { href: "/settings/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export interface DashboardWithCollapsibleSidebarProps {
  children: ReactNode;
  header: ReactNode;
}

/**
 * Sigulon's responsive dashboard shell. It deliberately owns navigation and
 * presentation state only; route pages continue to own their API data.
 */
export function DashboardWithCollapsibleSidebar({
  children,
  header,
}: DashboardWithCollapsibleSidebarProps) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopBreakpoint,
    getDesktopBreakpointSnapshot,
    () => false
  );
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const isOpen = userOverride ?? isDesktop;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#171321] dark:bg-[#14101F] dark:text-stone-100">
      <Suspense fallback={null}>
        <CollapsibleSidebarWithParams
          isOpen={isOpen}
          onToggle={() => setUserOverride((override) => !(override ?? isDesktop))}
        />
      </Suspense>

      <div
        className={cn(
          "min-h-screen min-w-0 transition-[padding] duration-300 ease-in-out",
          "pl-16",
          isOpen ? "lg:pl-64" : "lg:pl-16"
        )}
      >
        {header}
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function subscribeToDesktopBreakpoint(onChange: () => void) {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getDesktopBreakpointSnapshot() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  inboundActive?: boolean;
}

/** Reads the inbound filter preset; split out so the shell can suspend it during prerender. */
function CollapsibleSidebarWithParams({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const searchParams = useSearchParams();
  return (
    <CollapsibleSidebar
      isOpen={isOpen}
      onToggle={onToggle}
      inboundActive={searchParams.get("direction") === "inbound"}
    />
  );
}

function CollapsibleSidebar({
  isOpen,
  onToggle,
  inboundActive,
}: CollapsibleSidebarProps) {
  const pathname = usePathname();
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);

  const handleAction = (action: NonNullable<NavigationItem["action"]>) => {
    if (action === "test-call") setIsTestCallOpen(true);
  };

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-stone-200/70 bg-white dark:border-stone-800 dark:bg-stone-950",
          "transition-[width] duration-300 ease-in-out",
          isOpen ? "w-64 p-3" : "w-16 p-2"
        )}
      >
        <div className="mb-4 flex shrink-0 items-center border-b border-stone-200/70 px-2 pb-4 pt-1 dark:border-stone-800">
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3" aria-label="Sigulon dashboard">
            <div className="grid size-10 shrink-0 place-content-center rounded-xl bg-violet-600 text-white shadow-sm">
              <Radio className="h-5 w-5" />
            </div>
            <div className={cn("min-w-0 transition-opacity duration-200", isOpen ? "opacity-100" : "opacity-0")}>
              <span className="block truncate text-sm font-semibold text-stone-900 dark:text-white">
                Sigulon
              </span>
              <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                Your AI calling team
              </span>
            </div>
          </Link>
          {isOpen && <ChevronDown className="h-4 w-4 text-stone-400" aria-hidden="true" />}
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Primary navigation"
        >
          <NavigationGroup items={overview} isOpen={isOpen} label="Overview" pathname={pathname} onAction={handleAction} />
          <NavigationGroup items={yourTeam} isOpen={isOpen} label="Your team" pathname={pathname} onAction={handleAction} />
          <NavigationGroup items={calling} isOpen={isOpen} label="Calling" pathname={pathname} onAction={handleAction} inboundActive={inboundActive} />
          <NavigationGroup items={resultsAndSetup} isOpen={isOpen} label="Results & setup" pathname={pathname} onAction={handleAction} inboundActive={inboundActive} />
        </nav>

        <div className="shrink-0 border-t border-stone-200/70 pt-2 dark:border-stone-800">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-1.5 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            aria-label={isOpen ? "Collapse navigation" : "Expand navigation"}
            title={isOpen ? "Collapse navigation" : "Expand navigation"}
          >
            <span className="grid size-9 shrink-0 place-content-center">
              <ChevronsRight className={cn("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")} />
            </span>
            {isOpen && <span className="text-sm font-medium">Hide</span>}
          </button>
        </div>
      </aside>

      <TestCallDialog
        isOpen={isTestCallOpen}
        onClose={() => setIsTestCallOpen(false)}
      />
    </>
  );
}

interface NavigationGroupProps {
  isOpen: boolean;
  items: NavigationItem[];
  label: string;
  pathname: string;
  onAction: (action: NonNullable<NavigationItem["action"]>) => void;
  inboundActive?: boolean;
}

function NavigationGroup({ isOpen, items, label, pathname, onAction, inboundActive }: NavigationGroupProps) {
  return (
    <div className="mb-5">
      {isOpen && (
        <p className="mb-1.5 px-3 text-xs font-medium text-stone-500 dark:text-stone-400">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const [hrefPath, hrefQuery] = (item.href ?? "").split("?");
          // Inbound links to /phone-numbers with a filter preset: active only
          // when the preset is on. Numbers stays active for the unfiltered view.
          // Settings matches exactly so Billing/Team keep their own highlight.
          let isActive: boolean;
          if (!hrefPath) {
            isActive = false;
          } else if (hrefQuery) {
            isActive = pathname === hrefPath && inboundActive === true;
          } else if (hrefPath === "/settings") {
            isActive = pathname === hrefPath;
          } else if (hrefPath === "/phone-numbers") {
            isActive = pathname === hrefPath && !inboundActive;
          } else {
            isActive = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
          }
          const Icon = item.icon;

          const classes = cn(
            "group relative flex h-11 w-full items-center rounded-xl transition-all duration-200",
            isOpen ? "" : "justify-center",
            isActive
              ? "bg-violet-600 font-medium text-white shadow-sm"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          );
          const iconClasses = cn(
            "h-4 w-4",
            isActive ? "text-white" : "text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300"
          );

          const inner = (
            <>
              <span className="grid h-full w-12 shrink-0 place-content-center">
                <Icon className={iconClasses} />
              </span>
              {isOpen && <span className="truncate text-sm">{item.label}</span>}
              {item.badge && isOpen && (
                <span className="ml-auto rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </>
          );

          if (item.action) {
            return (
              <button
                key={`${label}-${item.label}`}
                type="button"
                onClick={() => item.action && onAction(item.action)}
                title={isOpen ? undefined : item.label}
                className={classes}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={`${label}-${item.label}`}
              href={item.href ?? "#"}
              aria-current={isActive ? "page" : undefined}
              title={isOpen ? undefined : item.label}
              className={classes}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Alias retained for drop-in use in examples that import `Example`.
export const Example = DashboardWithCollapsibleSidebar;

export default DashboardWithCollapsibleSidebar;
