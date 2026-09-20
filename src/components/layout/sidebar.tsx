"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Megaphone,
  PhoneCall,
  Users,
  CreditCard,
  UserPlus,
  Radio,
  Sparkles,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Voice Agents", href: "/agents", icon: Bot },
  { name: "Agent Builder", href: "/agents/builder", icon: Sparkles },
  { name: "Phone Numbers", href: "/phone-numbers", icon: Phone },
  { name: "Campaigns", href: "/campaigns", icon: Megaphone },
  { name: "Call Logs", href: "/calls", icon: PhoneCall },
  { name: "Contacts", href: "/contacts", icon: Users },
];

const settingsItems = [
  { name: "Telephony & Plivo", href: "/phone-numbers", icon: Radio },
  { name: "Billing & Credits", href: "/settings/billing", icon: CreditCard },
  { name: "Team Members", href: "/settings/team", icon: UserPlus },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-stone-200 px-6 dark:border-stone-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-violet-500 text-white shadow-md shadow-violet-500/20">
          <Radio className="h-5 w-5 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-stone-900 text-base tracking-tight dark:text-white flex items-center gap-1.5">
            Sigulon <span className="text-violet-600">Voice</span>
          </span>
          <span className="text-[11px] font-medium text-stone-400">Voice AI Platform</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto px-4 py-6">
        <div className="space-y-6">
          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
              Main Operations
            </div>
            <nav className="space-y-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4",
                        isActive ? "text-violet-600 dark:text-violet-400" : "text-stone-400"
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
              Management
            </div>
            <nav className="space-y-1">
              {settingsItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4",
                        isActive ? "text-violet-600 dark:text-violet-400" : "text-stone-400"
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Engine status footer */}
        <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3.5 dark:border-violet-900/40 dark:bg-violet-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              Voice Runtime
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Connected
            </span>
          </div>
          <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
            Ultra-low latency STT + TTS streaming ready.
          </p>
        </div>
      </div>
    </aside>
  );
}
