"use client";

import { NotebookPen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setTeamNotes } from "@/domain/edits";
import type { PlanEditor } from "./use-plan-editor";

/** EM-66: plain-text notes for everyone working on the event, saved with the version check (EM-62). */
export function TeamNotes({ editor }: { editor: PlanEditor }): React.ReactElement {
  const stored = editor.plan.teamNotes;
  const [text, setText] = useState(stored);
  const [base, setBase] = useState(stored);
  const [saved, setSaved] = useState(false);
  // Someone else's saved notes replace the box, unless the user is mid-edit.
  if (stored !== base) {
    setBase(stored);
    if (text === base) setText(stored);
  }
  const dirty = text !== stored;

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaved(await editor.edit("your team notes", (p) => setTeamNotes(p, text)));
  };

  return (
    <section aria-labelledby="team-notes-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id="team-notes-heading" className="flex items-center gap-2 font-bold text-xl">
        <NotebookPen aria-hidden="true" className="size-5 text-accent-foreground" />
        Team notes
      </h2>
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2">
        <label htmlFor="team-notes" className="sr-only">
          Team notes
        </label>
        <Textarea
          id="team-notes"
          value={text}
          maxLength={2000}
          rows={4}
          placeholder="Who is calling which vendor, decisions made, things to remember."
          aria-describedby="team-notes-hint"
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="team-notes-hint" aria-live="polite" className="text-muted-foreground text-xs">
            {saved && !dirty ? "Notes saved" : `Plain text, visible to everyone on this event. ${text.length.toLocaleString()} of 2,000 characters.`}
          </p>
          <Button type="submit" size="sm" variant="outline" disabled={!dirty} loading={editor.busy && dirty}>
            Save notes
          </Button>
        </div>
      </form>
    </section>
  );
}
