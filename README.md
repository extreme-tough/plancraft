# PlanCraft

PlanCraft turns an event description into a budget and a task plan, and keeps that plan right when things change. When the budget, date or guest count changes, or you ask for something in plain words, it shows a before/after view of every line and task affected. Nothing changes until you press Apply. It also reads vendor quotes, checks their arithmetic and tax, and compares them against the budget line.

- **Live app:** https://plancraft--plant-care-copilot.asia-southeast1.hosted.app. Opening it signs you in to a shared demo account with a sample wedding plan (₹8 lakh, 150 guests in Jaipur). The demo is rebuilt every night at 3:00 AM IST.
- **Built for:** PromptWars Challenge 5 (Celebration and Event Planner SaaS).
- **Sources of truth:** [the product spec](3.%20Product-specification-v3-mvp.md) (requirements by ID), [the implementation plan](4.%20Implementation%20Plan.md) and [DESIGN.md](DESIGN.md).

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [The three AI calls](#the-three-ai-calls)
4. [Google services used](#google-services-used)
5. [AI tools used to build it](#ai-tools-used-to-build-it)
6. [Human and GenAI work](#human-and-genai-work)
7. [Testing](#testing)
8. [Security](#security)
9. [Accessibility](#accessibility)
10. [Running it locally](#running-it-locally)
11. [Requirements: code and tests](#requirements-code-and-tests)

## What it does

The core loop: **create an event → answer a few questions → get a plan → change something → see the before/after → Apply → compare quotes.**

| Screen | Route | What you can do |
|---|---|---|
| Event creation | `/events/new` | Pick a use case, describe the event, type the budget as "8 lakh" or "€12.500" and see it read back, then answer a fixed set of questions |
| Plan dashboard | `/events/[eventId]` | Budget lines with AI Estimate, Vendor Quoted or Confirmed labels; tasks with dependencies, deadlines and "Next up"; payments; notifications; team notes; a moodboard |
| Revision | `/events/[eventId]/revise` | Change the budget, date or guests, or ask for a change in your own words. See every changed line and task, pick a trade-off option, then Apply or Discard |
| Quotes | `/events/[eventId]/quotes` | Paste a quote. The AI reads it, and code checks the total, tax and currency, scores the fit and compares quotes side by side |

**What the AI does and what code does.** The AI understands descriptions and requests, and proposes lines, weights, cost ranges, tasks, dependencies and trade-offs. **Code does all the arithmetic:** every amount, total, deadline, label and check. Amounts are integer minor units of the event's currency (JPY 0 decimals, INR 2, BHD 3). Confirmed costs can't be changed by the AI.

## Architecture

More detail, including the data model and a flow diagram: [docs/architecture.md](docs/architecture.md).

```
Browser (Next.js client, Firebase Auth + Firestore SDKs)
  │  reads and writes its own events directly (Firestore rules: users/{uid}/** only)
  │  calls /api/ai/* with a Firebase ID token
  ▼
Next.js on Firebase App Hosting (Cloud Run)
  ├─ /api/ai/plan | revise | quote → src/server/ai/pipeline.ts
  │     verify token → rate limits → Zod request → prompt → Gemini → Zod + rules → one repair → envelope
  ├─ /api/demo/session        custom token for the shared demo account
  └─ /api/internal/demo-reset nightly reset, called by Cloud Scheduler with an OIDC token
  ▼
Gemini on Vertex AI (service account; no API key exists)
```

| Folder | What it holds |
|---|---|
| [src/domain](src/domain) | **Pure logic**, with no React, Next, Firebase or I/O (a lint rule enforces this): schemas, money, the amount parser, allocation, guests, schedule, the dependency graph, labels, the diff, proposals, quote checks, the fit score and alerts |
| [src/server](src/server) | The AI pipeline, providers, prompts and contracts; rate limits; token checks; env validation; CSP |
| [src/data](src/data) | The repository interface, with an in-memory version for tests and a Firestore version with version-checked transactions |
| [src/features](src/features) | One folder per screen |
| [src/app](src/app) | Routes only |
| [tests](tests) | `unit/`, `property/`, `contract/`, `rules/`, `e2e/`, and AI fixtures in `fixtures/ai/` |

## The three AI calls

There are exactly three, all through [src/server/ai/pipeline.ts](src/server/ai/pipeline.ts). The contracts are Zod schemas shared by the server and the browser. `z.toJSONSchema()` turns them into the Gemini response schema, so the types, the runtime check and the model contract can't drift apart.

| Call | Contract | Rules checked after Zod | Model settings | If it fails (spec §7.6) |
|---|---|---|---|---|
| `POST /api/ai/plan` | [plan-contract.ts](src/domain/plan-contract.ts): 3–25 lines with weights and cost ranges, 5–40 tasks with lead times, durations and dependencies, assumptions, open questions | P1–P8: unique keys, references resolve, no dependency loops, parts match, high ≥ low, at most one contingency line | temperature 0.4, 45 s | The event is saved. Retry, or start with an empty plan (categories only, no invented amounts) |
| `POST /api/ai/revise` | [revision-contract.ts](src/domain/revision-contract.ts): an interpretation and up to 3 options, each a list of typed operations | R1–R8: bad options are dropped (for example R4: an option that touches a Confirmed line); at least 2 must remain when there is a shortfall | temperature 0.3, 30 s | The change calculated by code can still be applied. Retry, or edit the lines yourself |
| `POST /api/ai/quote` | [quote-contract.ts](src/domain/quote-contract.ts): items, stated total, tax treatment, guests covered, inclusions, needs coverage, clarifications | Q1–Q2 fail the response. Q3–Q5 flag values that aren't found in the quote text | temperature 0, 30 s | The pasted text is saved. Retry, or enter the details by hand (the same checks run) |

**What every call does:**

- **Validation:** output is checked with Zod and the rule functions. One repair attempt sends back the IDs of the rules that failed. Output that fails twice is never shown or used.
- **Untrusted text:** quotes and requests go inside `<quote>` or `<request>` delimiters and are treated as data.
- **No arithmetic or labels:** the AI schemas have no `label` field and no operation that changes the event's budget, date or guests.
- **References:** internal IDs are swapped for short references (`L1`, `T1`), and the model can't invent IDs.
- **Logging:** logs hold rule IDs and error codes only, never user text or AI text.

The prompts are in [src/server/ai/prompts](src/server/ai/prompts). How they changed: [docs/prompts-changelog.md](docs/prompts-changelog.md).

## Google services used

| Service | What it does here |
|---|---|
| **Gemini on Vertex AI** (`gemini-3.8-flash`, `global` location) | The three AI calls, in JSON mode with a response schema. Reached with the App Hosting service account, so there is no AI API key |
| **Firebase App Hosting** (on Cloud Run) | Builds and serves the Next.js app and its API routes from `main` |
| **Firebase Authentication** | Google sign-in, and custom-token sign-in to the shared demo account |
| **Cloud Firestore** | Each user's events and quotes, with offline cache and live updates; server-only rate-limit counters (with TTL) and demo state |
| **Cloud Storage for Firebase** | Moodboard images, under each user's own path |
| **Cloud Scheduler** | Calls the demo reset route every night at 3:00 AM IST, with an OIDC token |
| **IAM service accounts** | Vertex AI access, signing demo custom tokens, and the Scheduler's identity |
| **Secret Manager** | Available through `apphosting.yaml`. The app needs no secrets today |

One-time setup steps: [docs/setup.md](docs/setup.md).

## AI tools used to build it

| Tool | Used for | Why |
|---|---|---|
| **Claude Code** (Claude Opus) | Writing the code, tests and docs slice by slice, running the test suites, and checking the live app in a browser | It works inside the repo and runs the same checks as CI, so every slice landed with passing tests |
| **Gemini on Vertex AI** | The product's own AI calls | A Google service that supports a JSON response schema, is fast enough for a 45-second plan, and needs no API key |
| **Figma** (read through its MCP server) | Reading the four screens and design tokens | Kept the built screens matched to the design |
| **Context7** | Current library documentation (Next.js 15, Firebase, `@google/genai`, Zod 4) | Avoided writing code against out-of-date APIs |

## Human and GenAI work

| Work | Done by |
|---|---|
| The product idea, persona (Indian family wedding, ₹8 lakh, 150 guests) and every founder decision (spec §14: accounts, shared demo, model, daily cap, cuts) | Human |
| The spec's audit findings, tiers and verification codes (spec v3) | GenAI draft, reviewed and decided by a human |
| The Figma screens and DESIGN.md tokens | Human-led design |
| The stack choice and the slice plan | GenAI proposal, approved by a human |
| Code, tests, prompts and docs | GenAI (Claude Code), reviewed slice by slice by a human |
| Google Cloud and Firebase project setup, sign-ins and permissions, deploying the security rules | Human |
| Testing the live app with live Gemini, and the demo video | Human, with GenAI help to check the live app |

## Testing

| Suite | Command | What it covers |
|---|---|---|
| Unit | `pnpm test` | The domain module: money, the amount parser, allocation, schedule, labels, edits, proposals, quote checks, the fit score, alerts; plus the AI pipeline, env and server helpers |
| Property (fast-check) | `pnpm test` | INV-1 to INV-10, such as Σ line amounts + remaining = budget, Confirmed lines never change, no dependency loops, and Discard leaves the plan unchanged |
| Contract | `pnpm test` | Every AI contract with a valid fixture, every malformed class, and the repair path |
| Security rules | `pnpm test:rules` | Firestore and Storage on emulators: the owner is allowed; other users, the demo account reading a Google user's data, and unauthenticated requests are denied |
| End to end + axe | `pnpm test:e2e` | Playwright on the emulators with the fixture AI provider: the final acceptance test (spec §12) for INR/`en-IN`, EUR/`de-DE` and JPY/`ja-JP`, a variant where the AI is down, a keyboard-only run, a 360 px layout check, and axe on every screen |

Tests never call the live model. The domain module has a 90% line coverage gate in CI (currently about 98%).

**CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push: lint, typecheck, unit, property and contract tests with coverage, the README requirement check, repo size, rules tests, a production build, bundle size, E2E with axe, gitleaks and a dependency audit.

## Security

- **Data isolation:** Firestore and Storage rules allow `users/{uid}/**` only to that user. Everything else is denied. Document sizes and types are enforced.
- **AI endpoints:**
  - Each request needs a verified Firebase ID token. Bodies are checked with Zod and capped at 100 KB.
  - Rate limits are counted in Firestore, so they hold across instances. Google users get 10 a minute and 100 a day. The demo account is limited per IP (10 a minute, 50 a day) and to 1,500 a day in total. All users share a cap of 2,000 a day.
- **No secrets in the repo:** there is no AI API key. Only `.env.example` is committed, and gitleaks runs in CI. The Firebase web config is public by design.
- **Headers:** a strict CSP with a per-request nonce and no `'unsafe-inline'` scripts, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Rendering:** user and AI text is always rendered as text. A lint rule bans raw-HTML APIs.
- **Shared demo account:** it has no password, is never linked to another sign-in method, can't upload images, and is reset nightly. Edits are version-checked, so two reviewers can't silently overwrite each other.

## Accessibility

WCAG 2.1 AA:

- axe reports 0 serious or critical violations on every screen and state, and checks run in E2E.
- The core loop works with the keyboard only, with visible focus.
- Statuses use text and an icon, never colour alone. Every meter shows its value as text.
- Async updates are announced with `aria-live="polite"`: AI progress, parsed amounts and save state.
- No horizontal scrolling at 360 px.
- Animations respect `prefers-reduced-motion`.

## Running it locally

You need Node 22, pnpm, and JDK 21 for the emulators.

```bash
pnpm install
cp .env.example .env.local   # fill in the NEXT_PUBLIC_FIREBASE_* values
pnpm dev
```

`AI_PROVIDER=fixture` serves the test fixtures instead of Gemini. The app refuses to start that way when `NODE_ENV=production`.

| Command | What it does |
|---|---|
| `pnpm test` | Unit, property and contract tests |
| `pnpm test:rules` | Firestore and Storage rules tests on the emulators |
| `pnpm test:e2e` | Playwright + axe on the emulators |
| `pnpm lint`, `pnpm typecheck` | ESLint (including the domain-purity and no-raw-HTML rules) and `tsc` |
| `pnpm check:readme` | Every requirement ID in the spec appears in the table below, and every linked file exists |
| `pnpm check:size`, `pnpm check:bundle` | Repo under 9 MB; first-load JS under 250 KB gzipped |
| `pnpm demo:reset` | Rebuilds the shared demo account by hand |

## Requirements: code and tests

Every EM, AI, UX and ENG requirement in [the spec](3.%20Product-specification-v3-mvp.md), with the code that implements it and the test that checks it (ENG-09). `pnpm check:readme` fails CI if an ID is missing from this table or a linked file doesn't exist.

**Status:** **Built**; **Partly built** (the MUST part is built and the SHOULD part isn't); **Not built** (a SHOULD or LATER item we didn't build); **Merged** (the spec folds it into another ID); **Principle** (guidance shown through other items).

### Accounts and demo access

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-57 | MUST | Google sign-in, own events only, Sign out | [auth.ts](src/lib/firebase/auth.ts), [app-header.tsx](src/features/shell/app-header.tsx) | [auth.spec.ts](tests/e2e/auth.spec.ts) | Built |
| EM-58 | MUST | Automatic sign-in to the shared demo account | [demo/session/route.ts](src/app/api/demo/session/route.ts), [session-gate.tsx](src/features/auth/session-gate.tsx) | [auth.spec.ts](tests/e2e/auth.spec.ts), [firestore.rules.test.ts](tests/rules/firestore.rules.test.ts) | Built |
| EM-59 | MUST | Data isolation by Firestore rules | [firestore.rules](firestore.rules), [storage.rules](storage.rules) | [firestore.rules.test.ts](tests/rules/firestore.rules.test.ts) | Built |
| EM-60 | SHOULD | Save a private copy with Google | [auth.ts](src/lib/firebase/auth.ts) (the demo account is never linked) | n/a | Not built |
| EM-61 | SHOULD | Delete my account and data | n/a | n/a | Not built |
| EM-62 | MUST | Concurrent edits are never silently lost | [firestore-repository.ts](src/data/firestore-repository.ts), [use-plan-editor.ts](src/features/dashboard/use-plan-editor.ts) | [hardening.spec.ts](tests/e2e/hardening.spec.ts), [firestore.rules.test.ts](tests/rules/firestore.rules.test.ts) | Built |
| EM-63 | MUST | Nightly demo reset at 3:00 AM IST | [demo-reset.ts](src/server/demo-reset.ts), [demo-reset/route.ts](src/app/api/internal/demo-reset/route.ts), [seed.ts](src/demo/seed.ts) | [demo-reset.test.ts](tests/unit/demo-reset.test.ts), [home.spec.ts](tests/e2e/home.spec.ts) | Built |

### Event creation and onboarding

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-01 | MUST | Event inputs: use case, occasion, type, place, date, budget, currency, guests, parts | [event-input.ts](src/domain/event-input.ts), [details-step.tsx](src/features/event-create/details-step.tsx) | [event-input.test.ts](tests/unit/event-input.test.ts), [event-create.spec.ts](tests/e2e/event-create.spec.ts) | Built |
| EM-02 | MUST | A fixed question form per use case | [questions-step.tsx](src/features/event-create/questions-step.tsx) | [event-create.spec.ts](tests/e2e/event-create.spec.ts) | Built |
| EM-03 | MUST | The plan is built from the user's own inputs and budget | [plan-build.ts](src/domain/plan-build.ts) | [plan-build.test.ts](tests/unit/plan-build.test.ts) | Built |
| EM-04 | MUST | Event types | [schemas.ts](src/domain/schemas.ts), [details-step.tsx](src/features/event-create/details-step.tsx) | [event-create.spec.ts](tests/e2e/event-create.spec.ts) | Built |
| EM-05 | MUST | Use-case selector | [event-create-wizard.tsx](src/features/event-create/event-create-wizard.tsx) | [event-input.test.ts](tests/unit/event-input.test.ts) | Built |
| EM-06 | MUST | "This is a starting point. Edit anything." | [dashboard.tsx](src/features/dashboard/dashboard.tsx) | [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |
| EM-37 | MUST | One ISO 4217 currency, integer minor units | [money.ts](src/domain/money.ts), [format.ts](src/domain/format.ts) | [money.test.ts](tests/unit/money.test.ts), [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| EM-38 | MUST | Amount fields accept "8 lakh", "€12.500" and so on, read back | [amount-parser.ts](src/domain/amount-parser.ts), [amount-field.tsx](src/features/event-create/amount-field.tsx) | [amount-parser.test.ts](tests/unit/amount-parser.test.ts) | Built |
| EM-39 | MUST + SHOULD | Every change saved to Firestore (MUST); export and import (SHOULD) | [firestore-repository.ts](src/data/firestore-repository.ts) | [firestore.rules.test.ts](tests/rules/firestore.rules.test.ts) | Partly built: no export or import |
| EM-40 | SHOULD | Event list: create, switch, delete | [events-home.tsx](src/features/events/events-home.tsx) | [home.spec.ts](tests/e2e/home.spec.ts) | Partly built: list, create and switch; no delete |

### Personalized planning

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-07 | MUST | Onboarding answers are sent with every AI request | [plan-build.ts](src/domain/plan-build.ts), [revision-contract.ts](src/domain/revision-contract.ts) | [plan-build.test.ts](tests/unit/plan-build.test.ts) | Built |
| EM-08 | MUST | "Ask for a change" box | [change-sheets.tsx](src/features/revision/change-sheets.tsx) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |
| EM-09 | MUST + SHOULD | "X is too expensive" gives at least two options (MUST); a "Find a cheaper option" button (SHOULD) | [revise.ts](src/server/ai/schemas/revise.ts) (rule R7) | [revise.test.ts](tests/contract/revise.test.ts) | Partly built: no per-line button |
| EM-10 | MUST | Mixed audiences reach the AI | Merged into EM-07 | [plan-build.test.ts](tests/unit/plan-build.test.ts) | Merged |
| EM-11 | MUST | No silent assumptions: an assumptions list and open questions | [plan-contract.ts](src/domain/plan-contract.ts), [dashboard.tsx](src/features/dashboard/dashboard.tsx) | [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |
| EM-12 | MUST | Different inputs give different plans | Merged into EM-03 | [plan-build.test.ts](tests/unit/plan-build.test.ts) | Merged |

### Budget management

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-13 | MUST | Categories; add, rename, delete and recategorize lines | [edits.ts](src/domain/edits.ts), [line-sheet.tsx](src/features/dashboard/line-sheet.tsx) | [edits.test.ts](tests/unit/edits.test.ts) | Built |
| EM-14 | MUST | Largest-remainder split of the user's budget by AI weights | [allocation.ts](src/domain/allocation.ts) | [money.test.ts](tests/unit/money.test.ts), [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| EM-15 | MUST + SHOULD | An unapplied revision is a what-if (MUST); named saved scenarios (SHOULD) | [proposal.ts](src/domain/proposal.ts) | [proposal.test.ts](tests/unit/proposal.test.ts), [invariants.test.ts](tests/property/invariants.test.ts) | Partly built: no named scenarios |
| EM-16 | MUST | Editing an amount updates totals in the same render | [budget.ts](src/domain/budget.ts) | [edits.test.ts](tests/unit/edits.test.ts), [dashboard.spec.ts](tests/e2e/dashboard.spec.ts) | Built |
| EM-17 | MUST | Guest change recalculates per-guest lines that follow the event | [guests.ts](src/domain/guests.ts) | [proposal.test.ts](tests/unit/proposal.test.ts) | Built |
| EM-18 | MUST | No automatic or proportional cuts | [edits.ts](src/domain/edits.ts), [proposal.ts](src/domain/proposal.ts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| EM-19 | MUST | AI lines carry the AI Estimate label, set by code | [labels.ts](src/domain/labels.ts), [plan-build.ts](src/domain/plan-build.ts) | [plan.test.ts](tests/contract/plan.test.ts) | Built |
| EM-20 | MUST | Only a user action sets Confirmed | [edits.ts](src/domain/edits.ts) | [edits.test.ts](tests/unit/edits.test.ts) | Built |
| EM-41 | MUST | Label changes: AI Estimate → Vendor Quoted → Confirmed | [labels.ts](src/domain/labels.ts) | [labels.test.ts](tests/unit/labels.test.ts), [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-42 | MUST | The AI never changes Confirmed lines | [proposal.ts](src/domain/proposal.ts), [revision-contract.ts](src/domain/revision-contract.ts) | [invariants.test.ts](tests/property/invariants.test.ts), [revise.test.ts](tests/contract/revise.test.ts) | Built |
| EM-43 | MUST | Flat or per-guest pricing, with the event's or the line's own guest count | [guests.ts](src/domain/guests.ts), [schemas.ts](src/domain/schemas.ts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| EM-44 | MUST | Σ line amounts + remaining = budget | [budget.ts](src/domain/budget.ts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |

### Timeline and tasks

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-21 | MUST | 5–40 tasks with priority, lead time, duration and dependencies | [plan-contract.ts](src/domain/plan-contract.ts) | [plan.test.ts](tests/contract/plan.test.ts) | Built |
| EM-22 | MUST | Tasks by deadline then priority; add, delete, edit, mark done | [edits.ts](src/domain/edits.ts), [task-sheet.tsx](src/features/dashboard/task-sheet.tsx) | [edits.test.ts](tests/unit/edits.test.ts) | Built |
| EM-23 | MUST | Dependencies shown on each task | [task-timeline.tsx](src/features/dashboard/task-timeline.tsx) | [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |
| EM-24 | MUST | Marking done unlocks dependents and updates progress | [schedule.ts](src/domain/schedule.ts) | [schedule.test.ts](tests/unit/schedule.test.ts), [dashboard.spec.ts](tests/e2e/dashboard.spec.ts) | Built |
| EM-25 | SHOULD | Forward pass from today: tight and overdue tasks | [schedule.ts](src/domain/schedule.ts) | [schedule.test.ts](tests/unit/schedule.test.ts) | Built |
| EM-26 | MUST | "Next up": up to 3 available tasks | [schedule.ts](src/domain/schedule.ts) | [schedule.test.ts](tests/unit/schedule.test.ts), [dashboard.spec.ts](tests/e2e/dashboard.spec.ts) | Built |
| EM-27 | MUST | "Change budget, date or guests" form | [change-sheets.tsx](src/features/revision/change-sheets.tsx), [revision.ts](src/domain/revision.ts) | [revision.test.ts](tests/unit/revision.test.ts) | Built |
| EM-28 | MUST | Covered by EM-52 to EM-54 and the final test | [proposal.ts](src/domain/proposal.ts) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Merged |
| EM-45 | MUST | Dependency loops are rejected everywhere | [graph.ts](src/domain/graph.ts) | [invariants.test.ts](tests/property/invariants.test.ts), [edits.test.ts](tests/unit/edits.test.ts) | Built |
| EM-46 | MUST | Deadlines from lead time and duration, in reverse topological order | [schedule.ts](src/domain/schedule.ts) | [schedule.test.ts](tests/unit/schedule.test.ts) | Built |
| EM-47 | SHOULD | "Vendor cancelled" revision | n/a | n/a | Not built |
| EM-55 | MUST | Calendar dates only; "today" is the device's date | [dates.ts](src/domain/dates.ts), [today.ts](src/lib/today.ts) | [event-input.test.ts](tests/unit/event-input.test.ts), [revision.test.ts](tests/unit/revision.test.ts) | Built |

### Vendor quotes

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-29 | MUST | Up to 5 vendor needs per line | [plan-contract.ts](src/domain/plan-contract.ts), [line-sheet.tsx](src/features/dashboard/line-sheet.tsx) | [plan-build.test.ts](tests/unit/plan-build.test.ts) | Built |
| EM-30 | MUST | Vendor questions, plus questions from the quote checks; copy to clipboard | [quote-checks.ts](src/domain/quote-checks.ts), [questions-panel.tsx](src/features/quotes/questions-panel.tsx) | [quote-checks.test.ts](tests/unit/quote-checks.test.ts), [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-31 | MUST + SHOULD + LATER | Paste quote text (MUST); `.docx` (SHOULD); PDF (LATER) | [add-quote-sheet.tsx](src/features/quotes/add-quote-sheet.tsx), [quote/route.ts](src/app/api/ai/quote/route.ts) | [quote.test.ts](tests/contract/quote.test.ts) | Partly built: paste only |
| EM-32 | MUST | Quotes compared within a line: over/under and needs coverage | [quote-checks.ts](src/domain/quote-checks.ts), [quote-card.tsx](src/features/quotes/quote-card.tsx) | [quote-checks.test.ts](tests/unit/quote-checks.test.ts) | Built |
| EM-33 | MUST | The comparison table's columns, calculated by code | [comparison-table.tsx](src/features/quotes/comparison-table.tsx) | [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-34 | MUST | No vendor recommendations; names labelled "From your quote: unverified" | [quote-card.tsx](src/features/quotes/quote-card.tsx), [plan-contract.ts](src/domain/plan-contract.ts) | [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-35 | MUST | No availability or confirmed-price fields; "Unverified until you confirm" | [quote-contract.ts](src/domain/quote-contract.ts), [quote-card.tsx](src/features/quotes/quote-card.tsx) | [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-36 | MUST | The app never contacts vendors; CSP allows only its own API and Firebase | [csp.ts](src/server/security/csp.ts) | [csp.test.ts](tests/unit/csp.test.ts) | Built |
| EM-48 | SHOULD | `.docx` upload with a 50-character scanned-file check | [quote-contract.ts](src/domain/quote-contract.ts) (the check, applied to pasted text) | [quote.test.ts](tests/contract/quote.test.ts) | Partly built: no `.docx` |
| EM-49 | MUST | Code checks items + fees + taxes − discounts against the stated total | [quote-checks.ts](src/domain/quote-checks.ts) | [quote-checks.test.ts](tests/unit/quote-checks.test.ts) | Built |
| EM-50 | MUST | Another currency is flagged; the user enters the converted total | [quote-checks.ts](src/domain/quote-checks.ts) | [quote-checks.test.ts](tests/unit/quote-checks.test.ts), [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| EM-51 | MUST | Tax treatment: included, excluded or unclear | [quote-checks.ts](src/domain/quote-checks.ts) | [quote-checks.test.ts](tests/unit/quote-checks.test.ts) | Built |

### Revisions

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-52 | MUST | Before/after for budget, date, guest and free-text changes | [diff.ts](src/domain/diff.ts), [revision-page.tsx](src/features/revision/revision-page.tsx) | [proposal.test.ts](tests/unit/proposal.test.ts), [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |
| EM-53 | MUST | Nothing changes until Apply; Apply checks invariants on a copy | [proposal.ts](src/domain/proposal.ts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| EM-54 | MUST | At least two valid options when there is a shortfall, effects calculated by code | [proposal.ts](src/domain/proposal.ts) | [proposal.test.ts](tests/unit/proposal.test.ts), [revise.test.ts](tests/contract/revise.test.ts) | Built |
| EM-56 | MUST | A stale proposal can't be applied | [proposal.ts](src/domain/proposal.ts), [start-revision.ts](src/features/revision/start-revision.ts) | [proposal.test.ts](tests/unit/proposal.test.ts), [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |

### Figma extras

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| EM-64 | SHOULD | Payments per line: paid so far, balance due date, note | [edits.ts](src/domain/edits.ts), [line-sheet.tsx](src/features/dashboard/line-sheet.tsx) | [alerts.test.ts](tests/unit/alerts.test.ts), [extras.spec.ts](tests/e2e/extras.spec.ts) | Built |
| EM-65 | SHOULD | Notifications bell from calculated alerts | [alerts.ts](src/domain/alerts.ts), [notifications.tsx](src/features/dashboard/notifications.tsx) | [alerts.test.ts](tests/unit/alerts.test.ts), [extras.spec.ts](tests/e2e/extras.spec.ts) | Built |
| EM-66 | SHOULD | Team notes per event and per quote | [team-notes.tsx](src/features/dashboard/team-notes.tsx), [quote-card.tsx](src/features/quotes/quote-card.tsx) | [alerts.test.ts](tests/unit/alerts.test.ts), [extras.spec.ts](tests/e2e/extras.spec.ts) | Built |
| EM-67 | SHOULD | Moodboard: up to 6 images with alt text, in Cloud Storage | [moodboard.ts](src/domain/moodboard.ts), [moodboard.tsx](src/features/dashboard/moodboard.tsx), [storage.rules](storage.rules) | [storage.rules.test.ts](tests/rules/storage.rules.test.ts), [extras.spec.ts](tests/e2e/extras.spec.ts) | Built |
| EM-68 | SHOULD | Quote fit score, calculated by code, with its parts | [fit-score.ts](src/domain/fit-score.ts) | [fit-score.test.ts](tests/unit/fit-score.test.ts), [extras.spec.ts](tests/e2e/extras.spec.ts) | Built |

### GenAI

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| AI-01 | MUST | The plan call gets the description and every answer | [plan/route.ts](src/app/api/ai/plan/route.ts), [plan.ts](src/server/ai/prompts/plan.ts) | [plan-build.test.ts](tests/unit/plan-build.test.ts), [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |
| AI-02 | MUST | No planning templates in code | [plan-build.ts](src/domain/plan-build.ts) | [plan.test.ts](tests/contract/plan.test.ts) | Built |
| AI-03 | MUST | Free-text requests and trade-offs come from the revision call | [revise/route.ts](src/app/api/ai/revise/route.ts) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |
| AI-04 | MUST | Requests become typed operations, applied only after the user agrees | [revision-contract.ts](src/domain/revision-contract.ts), [proposal.ts](src/domain/proposal.ts) | [revise.test.ts](tests/contract/revise.test.ts) | Built |
| AI-05 | MUST | No mock AI in production | [providers.ts](src/server/ai/providers.ts), [env.ts](src/server/env.ts) | [env.test.ts](tests/unit/env.test.ts), [ai-pipeline.test.ts](tests/unit/ai-pipeline.test.ts) | Built |
| AI-06 | MUST | Allocations always add up to the user's budget | [allocation.ts](src/domain/allocation.ts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| AI-07 | MUST | No dummy data as the basis for answers | [seed.ts](src/demo/seed.ts) (inputs only) | [event-input.test.ts](tests/unit/event-input.test.ts) | Built |
| AI-08 | MUST | Covered by UX-09, EM-19 and EM-35 | [budget-lines.tsx](src/features/dashboard/budget-lines.tsx) | [plan.spec.ts](tests/e2e/plan.spec.ts) | Merged |
| AI-09 | MUST | Nothing the AI proposes takes effect without Apply | [proposal.ts](src/domain/proposal.ts) | [proposal.test.ts](tests/unit/proposal.test.ts) | Built |
| AI-10 | MUST | Exactly three AI calls, each listed with its purpose | [pipeline.ts](src/server/ai/pipeline.ts) | [ai-pipeline.test.ts](tests/unit/ai-pipeline.test.ts) | Built |
| AI-11 | MUST | Every AI output is checked against its schema and rules | [pipeline.ts](src/server/ai/pipeline.ts) | [plan.test.ts](tests/contract/plan.test.ts), [revise.test.ts](tests/contract/revise.test.ts), [quote.test.ts](tests/contract/quote.test.ts) | Built |
| AI-12 | MUST | The plan stays usable when the AI is down | [plan-generator.tsx](src/features/dashboard/plan-generator.tsx), [revision-page.tsx](src/features/revision/revision-page.tsx), [manual-quote-sheet.tsx](src/features/quotes/manual-quote-sheet.tsx) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts), [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |

### UX and product quality

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| UX-01 | MUST | The core loop in one flow from the dashboard | [dashboard.tsx](src/features/dashboard/dashboard.tsx) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |
| UX-02 | SHOULD | A user-flow diagram and wireframes in `docs/` | [architecture.md](docs/architecture.md) (flow diagram) | n/a | Partly built: no wireframes (the Figma file has the screens) |
| UX-03 | Principle | Deliberate human product decisions | [Human and GenAI work](#human-and-genai-work) | n/a | Principle |
| UX-04 | Principle | A real user problem ahead of feature count | The spec's tiers | n/a | Principle |
| UX-05 | MUST | A web application | [src/app](src/app) | [home.spec.ts](tests/e2e/home.spec.ts) | Built |
| UX-06 | MUST | The walkthrough video | [video-script.md](docs/video-script.md) | n/a | Recorded from the live URL before submission |
| UX-07 | Info | No voice-over needed | n/a | n/a | Principle |
| UX-08 | MUST | The before/after view is one screen with Apply and Discard | [revision-page.tsx](src/features/revision/revision-page.tsx) | [final-acceptance.spec.ts](tests/e2e/final-acceptance.spec.ts) | Built |
| UX-09 | MUST | Assumptions panel on the plan, lines, options and quotes | [dashboard.tsx](src/features/dashboard/dashboard.tsx), [budget-lines.tsx](src/features/dashboard/budget-lines.tsx) | [plan.spec.ts](tests/e2e/plan.spec.ts) | Built |
| UX-10 | MUST | Reviewers land on the demo event; "Try an example" and sample quotes | [seed.ts](src/demo/seed.ts), [sample-quotes.ts](src/demo/sample-quotes.ts) | [event-create.spec.ts](tests/e2e/event-create.spec.ts), [quotes.spec.ts](tests/e2e/quotes.spec.ts) | Built |
| UX-11 | MUST | WCAG 2.1 AA, axe with 0 serious or critical | [form-field.tsx](src/features/event-create/form-field.tsx) | [dashboard.spec.ts](tests/e2e/dashboard.spec.ts), [hardening.spec.ts](tests/e2e/hardening.spec.ts) | Built |
| UX-12 | MUST | No horizontal scrolling at 360 px | [globals.css](src/app/globals.css) | [dashboard.spec.ts](tests/e2e/dashboard.spec.ts), [hardening.spec.ts](tests/e2e/hardening.spec.ts) | Built |

### Engineering

| ID | Tier | Requirement | Code | Tests | Status |
|---|---|---|---|---|---|
| ENG-01 | MUST | CI on every push | [ci.yml](.github/workflows/ci.yml) | CI | Built |
| ENG-02 | MUST | No secrets in the repo; no AI API key | [vertex-provider.ts](src/server/ai/vertex-provider.ts), [.env.example](.env.example) | [env.test.ts](tests/unit/env.test.ts), gitleaks in CI | Built |
| ENG-03 | MUST | Strict types, zero lint errors, a pure domain module | [tsconfig.json](tsconfig.json), [eslint.config.mjs](eslint.config.mjs) | `pnpm lint`, `pnpm typecheck` in CI | Built |
| ENG-04 | Principle | Security, efficiency, testing and accessibility | ENG-07, ENG-08, ENG-11, UX-11 | n/a | Principle |
| ENG-05 | Principle | Matches the problem statement | This table | n/a | Principle |
| ENG-06 | MUST | README: architecture, AI calls, AI tools, Google services, prompt changelog, human vs GenAI | This README, [prompts-changelog.md](docs/prompts-changelog.md) | n/a | Built |
| ENG-07 | MUST | Testing, with 90% line coverage of the domain module | [vitest.config.mts](vitest.config.mts) | [invariants.test.ts](tests/property/invariants.test.ts) | Built |
| ENG-08 | MUST | Security: tokens, rate limits, CSP, size limits | [rate-limit.ts](src/server/rate-limit.ts), [csp.ts](src/server/security/csp.ts) | [rate-limit.test.ts](tests/rules/rate-limit.test.ts), [csp.test.ts](tests/unit/csp.test.ts) | Built |
| ENG-09 | MUST | This requirement table | [check-readme-ids.mjs](scripts/check-readme-ids.mjs) | `pnpm check:readme` in CI | Built |
| ENG-10 | MUST | Repo under 9 MB | [check-repo-size.mjs](scripts/check-repo-size.mjs) | `pnpm check:size` in CI | Built |
| ENG-11 | MUST | Efficiency: no AI for recalculation, one call per action, lazy-loaded SDKs | [lazy.ts](src/lib/firebase/lazy.ts), [check-bundle-size.mjs](scripts/check-bundle-size.mjs) | `pnpm check:bundle` in CI | Built |
