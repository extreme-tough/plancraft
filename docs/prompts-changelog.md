# Prompt changelog

How the three prompts and their model contracts changed. The prompts are in [src/server/ai/prompts](../src/server/ai/prompts), and each one exports a version string (`plan-v1`, `revise-v1`, `quote-v1`). Bump the version with every wording change and add an entry here.

The contracts are as important as the wording. The model's output is held to a Zod schema plus rule functions, so most of the "prompt engineering" went into what the model is *allowed* to return, rather than into persuading it.

## Design choices that shaped every prompt

| Choice | Why |
|---|---|
| **The model never does arithmetic.** It returns weights, ranges and operations; code calculates every amount, total and deadline | Models add up badly, and money must add up exactly (EM-14, EM-44) |
| **No `label` field and no event-level operations in any schema** | The model can't mark a cost Confirmed or change the budget, date or guests, even if an instruction in a quote asks it to (EM-19, EM-42) |
| **Short references** (`L1`, `T1`, `N1` for new items) instead of UUIDs | Fewer tokens, and the model can't invent IDs that point at nothing |
| **Untrusted text inside `<quote>` and `<request>` delimiters**, with the system prompt saying it is data | Prompt injection can at worst produce wrong extracted fields, which the code checks then flag |
| **"Copy; never calculate"** in the quote prompt | Code checks the quote's arithmetic (EM-49). If the model filled in a missing total, a hidden charge would disappear |
| **One repair attempt that names the failed rule IDs**, not the error text | Gives the model a precise target. User text is never echoed into logs |

## plan-v1 (27 Oct 2026, S4)

- **First version.** The plan call gets every event field and onboarding answer (AI-01). It returns lines with weights and local cost ranges, tasks with lead times, durations and dependencies, assumptions and up to 5 open questions.
- **Settings:** temperature 0.4, a 45-second timeout, and thinking set to low.
  - A deeper thinking level risked the timeout in the day-1 check.
- **Model:** `gemini-3.8-flash` in the `global` location.
  - On 27 Oct, `gemini-2.5-flash` no longer answered in this project, and the current models answered only from `global`.
- **Fix, same day (contract, not wording).** The live call returned `400 INVALID_ARGUMENT`.
  - Bisecting against Vertex AI showed that `maxItems` on the top-level arrays (25 lines, 40 tasks) is refused.
  - The provider schema now leaves out `maxItems`. Zod still enforces every maximum, and the prompt states the counts.
  - The first live run after the fix returned a valid Jaipur plan in 26 seconds: 8 lines, 10 tasks, the Mehendi part, and the step-free and vegetarian needs reflected. It passed P1–P8 and summed exactly.
- **Output tokens:** capped at 12,288.

## revise-v1 (27 Oct 2026, S6)

- **First version.** It gets the current plan with Confirmed lines marked `locked: true`, the change calculated by code (new budget, date or guests, and the shortfall), and the user's request inside `<request>`.
- **Output:** an interpretation, up to 3 constraint changes and up to 3 options. Constraint changes are shown back for the user to confirm and are never applied. Each option is a list of typed operations: `set_amount`, `set_unit_cost`, `set_guests` (own-count lines only), `remove_line`, `add_line`, `remove_task`, `add_task` and `set_lead_time`.
- **The operations are flat objects with nullable fields,** not a `oneOf` union, because Gemini's response-schema subset doesn't support `oneOf`.
- **Rules R1–R6 and R8 drop bad options one by one.** For example, R4 drops an option that targets a locked line, and R5 drops one that creates a dependency loop. R7 fails the whole response when fewer than 2 options remain while there is a shortfall, which triggers the repair attempt.
- **The prompt says an option may close only part of the gap,** because the founder accepted partial options (Q8). Code shows the shortfall that's left.
- **Settings:** temperature 0.3 and a 30-second timeout.

## quote-v1 (28 Oct 2026, S7)

- **First version.** It gets the quote inside `<quote>`, plus the budget line's name, guest count and needs inside `<line>`.
- **Settings:** temperature 0, because extraction should be repeatable.
- **The prompt is explicit about copying:**
  - Amounts are given in major units as written.
  - Subtotal and total lines are left out of the items.
  - `statedTotal` is null when the quote states none. The model is never to add one up.
  - The currency is null unless the quote states it or a symbol makes it unambiguous. The model never converts.
  - Tax treatment is "unclear" for wording like "taxes as applicable".
- **`needsCoverage` has exactly one entry per need, with the need's text copied.** Code matches them by text, so the comparison table can show coverage per need.
- **Rules:** Q1 (discounts are zero or negative, everything else zero or positive) and Q2 (one needs-coverage entry per need) fail the response. Q3–Q5 only flag values. A value whose digits don't appear in the quote text shows "Check: not found in quote text" and lowers the fit score's clarity part (EM-68).
- **The model is told never to state availability, ratings or reliability** (EM-34, EM-35). No schema field could carry them anyway.
