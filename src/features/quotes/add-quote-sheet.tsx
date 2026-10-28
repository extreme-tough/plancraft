"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { QUOTE_TEXT_MAX, quoteTextProblem } from "@/domain/quote-contract";
import type { BudgetLine } from "@/domain/schemas";
import { SAMPLE_QUOTES } from "@/demo/sample-quotes";
import { FormField } from "@/features/event-create/form-field";

/**
 * EM-31: paste a quote against a budget line. The text is saved first, so nothing is lost if the AI
 * can't read it (spec §7.6). The disclosure says where the text goes before it is sent (A20).
 */
export function AddQuoteSheet({
  line,
  open,
  busy,
  onOpenChange,
  onAdd,
}: {
  line: BudgetLine;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (text: string) => Promise<boolean>;
}): React.ReactElement {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const problem = quoteTextProblem(text);
    setError(problem);
    if (problem) return;
    if (await onAdd(text.trim())) {
      setText("");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <form onSubmit={(e) => void submit(e)} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle className="wrap-anywhere pe-8">Add a quote for {line.name}</SheetTitle>
            <SheetDescription>Paste the vendor&apos;s quote. PlanCraft reads it, then checks the sums, tax, guests and currency.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p id="sample-quotes-label" className="font-medium text-sm">
                No quote to hand? Try a sample
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sample-quotes-label">
                {SAMPLE_QUOTES.map((sample) => (
                  <Button
                    key={sample.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setText(sample.text);
                      setError(null);
                    }}
                  >
                    {sample.title}
                  </Button>
                ))}
              </div>
            </div>

            <FormField id="quote-text" label="Quote text" error={error} hint={`${text.length.toLocaleString("en")} of ${QUOTE_TEXT_MAX.toLocaleString("en")} characters`}>
              {(aria) => <Textarea {...aria} value={text} rows={12} maxLength={QUOTE_TEXT_MAX} onChange={(e) => setText(e.target.value)} />}
            </FormField>

            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertDescription>The quote&apos;s text is sent to the AI provider (Gemini on Google Cloud) to read it. Nothing is sent to the vendor.</AlertDescription>
            </Alert>
          </SheetPanel>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Read the quote
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}
