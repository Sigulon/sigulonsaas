"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";

const validDirections = new Set(["all", "inbound", "outbound"]);
const validPeriods = new Set(["today", "7d", "30d"]);

/** Dashboard-only operation filters. Account controls live in Settings. */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (pathname !== "/dashboard") return null;

  const direction = validDirections.has(searchParams.get("direction") ?? "")
    ? searchParams.get("direction")!
    : "all";
  const period = validPeriods.has(searchParams.get("period") ?? "")
    ? searchParams.get("period")!
    : "7d";

  function updateFilter(name: "direction" | "period", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(name, value);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 w-full flex-col justify-center gap-3 border-b border-stone-200/70 bg-white/90 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:border-stone-800 dark:bg-stone-950/90">
      <div className="flex items-center gap-2 text-stone-900 dark:text-white">
        <span className="grid size-8 place-content-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
          <Filter className="h-4 w-4" />
        </span>
        <div>
          <span className="block text-sm font-bold tracking-tight">Operations filters</span>
          <span className="block text-[11px] text-stone-500 dark:text-stone-400">Refine the recent call log by direction and time period.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="operation-direction">Call direction</label>
        <select
          id="operation-direction"
          value={direction}
          onChange={(event) => updateFilter("direction", event.target.value)}
          className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
        >
          <option value="all">All operations</option>
          <option value="outbound">Outbound calls</option>
          <option value="inbound">Inbound calls</option>
        </select>

        <label className="sr-only" htmlFor="operation-period">Time period</label>
        <select
          id="operation-period"
          value={period}
          onChange={(event) => updateFilter("period", event.target.value)}
          className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>
    </header>
  );
}
