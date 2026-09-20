import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantStyles = {
    default: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-transparent",
    secondary: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-transparent",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-transparent",
    destructive: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-transparent",
    outline: "text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
