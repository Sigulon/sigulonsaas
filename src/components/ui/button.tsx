import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gold";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-xl font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

    const variantStyles = {
      default: "bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500 shadow-sm",
      destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
      outline: "border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 focus-visible:ring-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
      secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100",
      ghost: "hover:bg-stone-100 text-stone-700 dark:text-stone-300 dark:hover:bg-stone-800",
      link: "text-violet-600 underline-offset-4 hover:underline p-0 h-auto",
      gold: "bg-[#C9952B] text-white hover:bg-[#A8781F] focus-visible:ring-[#C9952B] shadow-sm",
    };

    const sizeStyles = {
      default: "h-10 py-2 px-4",
      sm: "h-8 px-3 text-xs rounded-lg",
      lg: "h-11 px-8 rounded-xl text-base",
      icon: "h-10 w-10 p-0 flex items-center justify-center",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
