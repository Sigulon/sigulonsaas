"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Bell,
  BookOpen,
  Menu,
  Moon,
  Sun,
  User,
  ChevronDown,
  CheckCircle2,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import { AddCreditsModal } from "./add-credits-modal";
import { GlobalSearchModal } from "./global-search-modal";

interface TopbarProps {
  onToggleMobileMenu?: () => void;
}

export function Topbar({ onToggleMobileMenu }: TopbarProps) {
  const [credits, setCredits] = useState<number>(50);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial dark mode from document
    if (document.documentElement.classList.contains("dark")) {
      setIsDarkMode(true);
    }

    async function loadBalance() {
      try {
        const res = await fetch("/api/billing/summary", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.balance !== undefined) setCredits(data.balance);
        }
      } catch (err) {
        console.error("[topbar] Error loading balance:", err);
      }
    }
    loadBalance();
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }
  };

  return (
    <>
      <header className="h-16 sticky top-0 z-20 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-md border-b border-[#e5e7eb] dark:border-[#404040] px-4 sm:px-6 flex items-center justify-between transition-colors">
        {/* Left: Mobile hamburger + Global Search */}
        <div className="flex items-center gap-3 w-full max-w-md">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800"
              aria-label="Open mobile navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Search Trigger */}
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 text-xs text-gray-400 bg-gray-50 dark:bg-neutral-800/80 hover:bg-gray-100 dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-700/80 rounded-lg transition-colors group text-left"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-neutral-300" />
              <span className="truncate">Search agents, campaigns, leads...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-gray-400 bg-white dark:bg-neutral-700 rounded border border-gray-200 dark:border-neutral-600 shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Usage Status + Credits + Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Active Calls Status Indicator */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>0 active calls</span>
          </div>

          {/* Credits Balance Pill with '+' Button */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-0.5 shadow-2xs">
            <Link
              href="/billing"
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-neutral-200 hover:text-blue-600 transition-colors"
            >
              <span className="font-mono text-gray-900 dark:text-white">
                ₹{credits.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-gray-400 font-normal ml-1 hidden sm:inline">credits</span>
            </Link>
            <button
              onClick={() => setIsCreditsModalOpen(true)}
              aria-label="Add credits"
              className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
              title="Add Credits"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          {/* Documentation */}
          <Link
            href="/docs"
            className="hidden sm:flex p-2 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            title="Documentation"
            aria-label="Documentation"
          >
            <BookOpen className="w-4 h-4" />
          </Link>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-xl p-3 z-50 animate-in fade-in duration-100">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-neutral-800">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">
                    Notifications
                  </span>
                  <span className="text-[10px] text-blue-600 hover:underline cursor-pointer">
                    Mark all read
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Lead Qualified
                    </div>
                    <p className="text-gray-500 dark:text-neutral-400 text-[11px] mt-0.5">
                      Ravi qualified Suresh Reddy (+91 98480 22338) for Auto Policy.
                    </p>
                    <span className="text-[10px] text-gray-400 mt-1 block">5 min ago</span>
                  </div>
                  <div className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800">
                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                      Campaign Active
                    </div>
                    <p className="text-gray-500 dark:text-neutral-400 text-[11px] mt-0.5">
                      Hyderabad Insurance Leads Q4 is dialing 12 concurrent lines.
                    </p>
                    <span className="text-[10px] text-gray-400 mt-1 block">15 min ago</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Menu */}
          <div className="relative">
            <button
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Account menu"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                P
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-neutral-200 hidden md:inline">
                Praveen
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {isAccountMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in duration-100 text-xs">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800">
                  <div className="font-semibold text-gray-900 dark:text-white">Praveen</div>
                  <div className="text-[11px] text-gray-400 truncate">praveen@sigulon.ai</div>
                  <div className="mt-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] inline-block">
                    Org: Acme Health
                  </div>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setIsAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  >
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    Account Settings
                  </Link>
                  <Link
                    href="/billing"
                    onClick={() => setIsAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Billing & Plan
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modals */}
      <AddCreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
        onCreditsAdded={(newBalance) => setCredits(newBalance)}
      />
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />
    </>
  );
}
