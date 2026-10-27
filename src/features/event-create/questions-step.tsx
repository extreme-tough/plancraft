"use client";

import { Lightbulb } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  AGE_GROUPS,
  EXPERIENCE_LEVELS,
  LIMITS,
  PRIORITY_CATEGORIES,
  splitMustHaves,
  type AgeGroup,
  type AnswersInput,
  type Experience,
} from "@/domain/event-input";
import type { Category } from "@/domain/schemas";
import { AGE_GROUP_TEXT, CATEGORY_TEXT, EXPERIENCE_TEXT, USE_CASE_TEXT } from "@/lib/display-names";
import type { UseCase } from "@/domain/event-input";
import { FormCard } from "./details-step";
import { describedBy, errorId, FieldErrorText, FormField } from "./form-field";

export const QUESTIONS_FIELD_ORDER = [
  "priorities",
  "mustHaves",
  "atmosphere",
  "cultural",
  "accessibility",
  "venueConstraints",
  "description",
] as const;

export function questionFieldId(field: string): string {
  return `answers-${field}`;
}

const chip =
  "flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors has-data-checked:border-primary has-data-checked:bg-accent has-data-disabled:cursor-not-allowed has-data-disabled:opacity-64";

/** Step 2: the fixed question form for the chosen use case (EM-02). Only priorities are required. */
export function QuestionsStep({
  value,
  useCase,
  errors,
  onChange,
}: {
  value: AnswersInput;
  useCase: UseCase;
  errors: Record<string, string>;
  onChange: (patch: Partial<AnswersInput>) => void;
}): React.ReactElement {
  const id = questionFieldId;
  const full = value.priorities.length >= LIMITS.priorities;
  const mustHaveCount = splitMustHaves(value.mustHaves).length;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <FormCard>
          <fieldset className="flex flex-col gap-3">
            <legend id="priorities-legend" className="mb-1 font-semibold">
              Spending priorities
            </legend>
            <p id="priorities-hint" className="text-muted-foreground text-sm">
              Pick 1 to 3 things that matter most. {value.priorities.length} of {LIMITS.priorities} picked.
            </p>
            <CheckboxGroup
              id={id("priorities")}
              value={value.priorities}
              onValueChange={(next) => onChange({ priorities: next as Category[] })}
              aria-labelledby="priorities-legend"
              aria-describedby={describedBy("priorities-hint", errors.priorities && errorId(id("priorities")))}
              className="flex flex-row flex-wrap gap-2"
            >
              {PRIORITY_CATEGORIES.map((category) => {
                const checked = value.priorities.includes(category);
                return (
                  <label key={category} className={chip}>
                    <Checkbox value={category} disabled={full && !checked} />
                    {CATEGORY_TEXT[category]}
                  </label>
                );
              })}
            </CheckboxGroup>
            <FieldErrorText id={id("priorities")} error={errors.priorities} />
          </fieldset>
        </FormCard>

        <FormCard>

          <FormField
            id={id("mustHaves")}
            label="Must-haves"
            optional
            labelClassName="font-semibold text-base"
            hint={`One per line, up to ${LIMITS.mustHaves}. ${mustHaveCount} so far.`}
            error={errors.mustHaves}
          >
            {(aria) => (
              <Textarea
                {...aria}
                value={value.mustHaves}
                placeholder={"Live music\nVegetarian menu"}
                onChange={(e) => onChange({ mustHaves: e.target.value })}
              />
            )}
          </FormField>
        </FormCard>

        <FormCard>
          <fieldset className="flex flex-col gap-3">
            <legend id="experience-legend" className="mb-1 font-semibold">
              Planning experience <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <RadioGroup
              value={value.experience === "" ? null : value.experience}
              onValueChange={(next) => onChange({ experience: next as Experience })}
              aria-labelledby="experience-legend"
              className="flex flex-col gap-2"
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <label key={level} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Radio value={level} />
                  {EXPERIENCE_TEXT[level]}
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <FormField
            id={id("atmosphere")}
            label="Atmosphere"
            optional
            hint="For example: relaxed and family-friendly"
            error={errors.atmosphere}
          >
            {(aria) => (
              <Input
                {...aria}
                value={value.atmosphere}
                maxLength={LIMITS.atmosphere}
                onChange={(e) => onChange({ atmosphere: e.target.value })}
              />
            )}
          </FormField>

          <fieldset className="flex flex-col gap-3">
            <legend id="age-groups-legend" className="mb-1 font-semibold">
              Age groups attending <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <CheckboxGroup
              value={value.ageGroups}
              onValueChange={(next) => onChange({ ageGroups: next as AgeGroup[] })}
              aria-labelledby="age-groups-legend"
              className="flex flex-row flex-wrap gap-2"
            >
              {AGE_GROUPS.map((group) => (
                <label key={group} className={chip}>
                  <Checkbox value={group} />
                  {AGE_GROUP_TEXT[group]}
                </label>
              ))}
            </CheckboxGroup>
          </fieldset>
        </FormCard>

        <FormCard>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id={id("cultural")} label="Cultural or religious requirements" optional error={errors.cultural}>
              {(aria) => (
                <Textarea
                  {...aria}
                  value={value.cultural}
                  maxLength={LIMITS.longAnswer}
                  onChange={(e) => onChange({ cultural: e.target.value })}
                />
              )}
            </FormField>
            <FormField id={id("accessibility")} label="Accessibility needs" optional error={errors.accessibility}>
              {(aria) => (
                <Textarea
                  {...aria}
                  value={value.accessibility}
                  maxLength={LIMITS.longAnswer}
                  onChange={(e) => onChange({ accessibility: e.target.value })}
                />
              )}
            </FormField>
            <FormField id={id("venueConstraints")} label="Venue constraints" optional error={errors.venueConstraints}>
              {(aria) => (
                <Textarea
                  {...aria}
                  value={value.venueConstraints}
                  maxLength={LIMITS.longAnswer}
                  onChange={(e) => onChange({ venueConstraints: e.target.value })}
                />
              )}
            </FormField>
            <FormField id={id("description")} label="Anything else we should know?" optional error={errors.description}>
              {(aria) => (
                <Textarea
                  {...aria}
                  value={value.description}
                  maxLength={LIMITS.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                />
              )}
            </FormField>
          </div>
        </FormCard>
      </div>

      <aside className="flex gap-3 rounded-2xl border bg-card/80 p-4 text-sm shadow-card">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-info text-white">
          <Lightbulb className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">Why we ask this</h3>
          <p className="text-muted-foreground">
            Your plan is built from these answers. The defaults suit a {USE_CASE_TEXT[useCase].title.toLowerCase()};
            change anything. Accessibility and cultural needs show up as budget lines or tasks.
          </p>
        </div>
      </aside>
    </div>
  );
}
