"use client";

import { useSyncExternalStore, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  ChevronDown,
  ChevronsRight,
  LayoutDashboard,
  Megaphone,
  Phone,
  PhoneCall,
  Radio,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
};

const operations: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Operations" },
  { href: "/agents", icon: Bot, label: "Voice Agents" },
  { href: "/agents/builder", icon: Sparkles, label: "Agent Studio" },
  { href: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { href: "/calls", icon: PhoneCall, label: "Call Logs" },
  { href: "/contacts", icon: Users, label: "Contacts" },
  { href: "/phone-numbers", icon: Phone, label: "Phone Numbers" },
];

const account: NavigationItem[] = [
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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <CollapsibleSidebar
        isOpen={isOpen}
        onToggle={() => setUserOverride((override) => !(override ?? isDesktop))}
      />

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
}

function CollapsibleSidebar({
  isOpen,
  onToggle,
}: CollapsibleSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-gray-200 bg-white p-2 shadow-sm",
        "transition-[width] duration-300 ease-in-out",
        isOpen ? "w-64" : "w-16"
      )}
    >
      <div className="mb-4 flex shrink-0 items-center border-b border-gray-200 px-2 pb-4 pt-1">
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3" aria-label="Sigulon dashboard">
          <div className="grid size-10 shrink-0 place-content-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm">
            <Radio className="h-5 w-5" />
          </div>
          <div className={cn("min-w-0 transition-opacity duration-200", isOpen ? "opacity-100" : "opacity-0")}>
            <span className="block truncate text-sm font-semibold text-gray-900">
              Sigulon
            </span>
            <span className="block truncate text-xs text-gray-500">
              Voice Platform
            </span>
          </div>
        </Link>
        {isOpen && <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />}
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Primary navigation"
      >
        <NavigationGroup items={operations} isOpen={isOpen} label="Operations" pathname={pathname} />
        <NavigationGroup items={account} isOpen={isOpen} label="Account" pathname={pathname} />
      </nav>

      <div className="shrink-0 border-t border-gray-200 pt-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 w-full items-center gap-3 rounded-md px-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
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
  );
}

interface NavigationGroupProps {
  isOpen: boolean;
  items: NavigationItem[];
  label: string;
  pathname: string;
}

function NavigationGroup({ isOpen, items, label, pathname }: NavigationGroupProps) {
  return (
    <div className="mb-6">
      {isOpen && (
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={`${label}-${item.label}`}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              title={isOpen ? undefined : item.label}
              className={cn(
                "group relative flex h-11 w-full items-center rounded-md transition-all duration-200",
                isOpen ? "" : "justify-center",
                isActive
                  ? "border-l-2 border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="grid h-full w-12 shrink-0 place-content-center">
                <Icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600")} />
              </span>
              {isOpen && <span className="truncate text-sm font-medium">{item.label}</span>}
              {item.badge && isOpen && (
                <span className="ml-auto rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
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
