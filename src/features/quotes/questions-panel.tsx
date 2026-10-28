"use client";

import { Copy, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { questionText, type QuoteView } from "@/domain/quote-checks";
import type { BudgetLine } from "@/domain/schemas";

interface Group {
  id: string;
  heading: string;
  questions: string[];
}

/**
 * EM-30 (Figma "Clarifications dock"): the line's own vendor questions plus the ones code built from
 * each quote's checks, to copy into the user's own message. PlanCraft never contacts vendors (EM-36).
 */
export function QuestionsPanel({
  line,
  views,
  titles,
  locale,
}: {
  line: BudgetLine;
  views: readonly QuoteView[];
  titles: ReadonlyMap<string, string>;
  locale: string;
}): React.ReactElement | null {
  const groups: Group[] = [
    { id: "line", heading: "For every vendor", questions: line.vendorQuestions },
    ...views.map((view) => ({
      id: view.quote.id,
      heading: `For ${titles.get(view.quote.id) ?? "this vendor"}`,
      questions: view.questions.map((question) => questionText(question, locale)),
    })),
  ].filter((group) => group.questions.length > 0);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState("");

  if (groups.length === 0) return null;
  const key = (group: Group, i: number): string => `${group.id}:${i}`;

  const copy = async (): Promise<void> => {
    const chosen = groups
      .map((group) => ({ heading: group.heading, questions: group.questions.filter((_, i) => !unchecked.has(key(group, i))) }))
      .filter((group) => group.questions.length > 0);
    const count = chosen.reduce((n, group) => n + group.questions.length, 0);
    if (count === 0) return setStatus("Select at least one question to copy.");
    const text = chosen.map((group) => `${group.heading}:\n${group.questions.map((q) => `- ${q}`).join("\n")}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${count} ${count === 1 ? "question" : "questions"}.`);
    } catch {
      setStatus("Copying isn't allowed in this browser. Select the questions and copy them yourself.");
    }
  };

  return (
    <section aria-labelledby="questions-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MessageCircleQuestion aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent-foreground" />
          <div>
            <h2 id="questions-heading" className="font-bold text-xl">
              Questions to ask
            </h2>
            <p className="text-muted-foreground text-sm">Built from each quote&apos;s checks. Copy them into your own message to the vendor.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          Copy selected questions
        </Button>
      </div>
      <p aria-live="polite" className="text-sm empty:hidden">
        {status}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <fieldset key={group.id} className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
            <legend className="float-start mb-1 w-full wrap-anywhere font-semibold text-sm">{group.heading}</legend>
            {group.questions.map((question, i) => (
              <label key={i} className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={!unchecked.has(key(group, i))}
                  onCheckedChange={(checked) =>
                    setUnchecked((current) => {
                      const next = new Set(current);
                      if (checked) next.delete(key(group, i));
                      else next.add(key(group, i));
                      return next;
                    })
                  }
                />
                <span className="wrap-anywhere">{question}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
