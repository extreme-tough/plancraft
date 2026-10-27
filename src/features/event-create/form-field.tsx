"use client";

import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** What a control needs to point at its description and error (UX-11: errors via aria-describedby). */
export interface ControlAria {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export function errorId(id: string): string {
  return `${id}-error`;
}

export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

/** The error line under a field: text plus an icon, never colour alone. */
export function FieldErrorText({ id, error }: { id: string; error: string | null | undefined }): React.ReactElement | null {
  if (!error) return null;
  return (
    <p id={errorId(id)} className="flex items-start gap-1.5 text-destructive-foreground text-sm">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{error}</span>
    </p>
  );
}

/** Label, control, optional hint and error, wired together by id. */
export function FormField({
  id,
  label,
  hint,
  error,
  optional = false,
  className,
  labelClassName,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  labelClassName?: string;
  children: (aria: ControlAria) => ReactNode;
}): React.ReactElement {
  const hintId = hint ? `${id}-hint` : null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {/* Block, not inline-flex, so a long label wraps with "(optional)" as part of the sentence. */}
      <Label htmlFor={id} className={cn("block", labelClassName)}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy(hintId, error && errorId(id)),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {hint && (
        <p id={hintId ?? undefined} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      <FieldErrorText id={id} error={error} />
    </div>
  );
}
