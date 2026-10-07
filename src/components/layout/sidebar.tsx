"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  PlusCircle,
  Radio,
  Zap,
  Megaphone,
  PhoneIncoming,
  Users,
  Phone,
  CreditCard,
  Settings,
  History,
  BookOpen,
  HelpCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/agents/new", label: "Create new agent", icon: PlusCircle },
      { href: "/talk", label: "Talk to an agent", icon: Radio },
    ],
  },
  {
    title: "CALLING",
    items: [
      { href: "/calling/instant", label: "Instant Lead", icon: Zap },
      { href: "/calling/campaigns", label: "Bulk Campaigns", icon: Megaphone },
      { href: "/calling/inbound", label: "Inbound Calls", icon: PhoneIncoming },
    ],
  },
  {
    title: "RESULTS & SETUP",
    items: [
      { href: "/results", label: "Leads & Results", icon: Users },
      { href: "/phone-numbers", label: "Phone Numbers", icon: Phone },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "ANALYTICS",
    items: [
      { href: "/calls", label: "Call History", icon: History },
    ],
  },
];

interface SidebarProps {
  onCloseMobile?: () => void;
}

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [userName, setUserName] = useState("User");
  const [orgName, setOrgName] = useState("Workspace");

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.user?.name) setUserName(data.user.name);
          if (data.organization?.name) setOrgName(data.organization.name);
        }
      } catch (e) {
        console.error("[sidebar] Error loading session:", e);
      }
    }
    loadSession();
  }, []);

  return (
    <aside
      className={cn(
        "w-64 h-screen fixed left-0 top-0 z-30 flex flex-col justify-between",
        "bg-[#f9fafb] dark:bg-[#171717] border-r border-[#e5e7eb] dark:border-[#404040]",
        "select-none transition-colors duration-150"
      )}
    >
      {/* Top Branding */}
      <div>
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#e5e7eb] dark:border-[#404040]">
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:bg-blue-700 transition-colors">
              <Sparkles className="w-4 h-4 fill-white/20" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-gray-900 dark:text-white">
                  SIGULON
                </span>
                <span className="px-1.5 py-0.2 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[9px] font-semibold tracking-wide">
                  v2.5
                </span>
              </div>
              <p className="text-[10px] font-semibold tracking-wider text-gray-400 dark:text-neutral-500 uppercase">
                AI Voice Calling
              </p>
            </div>
          </Link>
        </div>

        {/* Scrollable Navigation */}
        <div className="px-3 py-4 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-gray-400 dark:text-neutral-500 uppercase">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors duration-150",
                        isActive
                          ? "bg-[#e0f2fe] text-[#1e3a8a] dark:bg-[#1e3a8a]/40 dark:text-[#bfdbfe] font-medium"
                          : "text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800/60 hover:text-gray-900 dark:hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            isActive
                              ? "text-[#3b82f6]"
                              : "text-gray-400 dark:text-neutral-400"
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            isActive
                              ? "bg-blue-200/70 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : "bg-gray-200/60 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Support Links */}
          <div className="pt-2 border-t border-[#e5e7eb] dark:border-[#404040] space-y-0.5">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                <span>Documentation</span>
              </div>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </a>
            <a
              href="mailto:support@sigulon.ai"
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              <span>Help & Support</span>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom User / Workspace Card */}
      <div className="p-3 border-t border-[#e5e7eb] dark:border-[#404040] bg-white dark:bg-[#171717]">
        <div className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0 uppercase">
              {userName.charAt(0)}
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                  {userName}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  ● Online
                </span>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-neutral-500 truncate">
                {orgName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
