"use client";

import { ChevronDown } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>: full keyboard and screen-reader support for free, and no extra JS for
 * short fixed lists (category, priority, status).
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">): React.ReactElement {
  return (
    <span className={cn("relative inline-flex w-full", className)}>
      <select
        className="h-9 w-full appearance-none rounded-lg border border-input bg-background ps-3 pe-9 text-base text-foreground shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 aria-invalid:border-destructive/64 sm:h-8 sm:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
    </span>
  );
}
