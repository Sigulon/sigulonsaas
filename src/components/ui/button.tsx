import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "subtle";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none";

    const variantStyles = {
      default: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:bg-blue-800",
      primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:bg-blue-800",
      destructive: "bg-red-600 text-white hover:bg-red-700 shadow-xs active:bg-red-800",
      outline: "border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
      secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
      subtle: "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60",
      ghost: "hover:bg-gray-100 text-gray-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
      link: "text-blue-600 underline-offset-4 hover:underline p-0 h-auto font-normal",
    };

    const sizeStyles = {
      default: "h-9 px-3.5 py-1.5 text-sm",
      sm: "h-8 px-2.5 text-xs",
      lg: "h-10 px-5 text-sm",
      icon: "h-9 w-9 p-0 flex items-center justify-center",
    };

    return (
      <button
        ref={ref}
        suppressHydrationWarning
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
