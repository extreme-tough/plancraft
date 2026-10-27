# CLAUDE.md

## Project overview

PlanCraft is an event-planning SaaS. It turns an event description into a budget and task plan, and revises that plan when constraints change. It also compares vendor quotes. It runs on Next.js with Firebase (Auth, Firestore, Storage, App Hosting) and Gemini on Vertex AI. It is a PromptWars Challenge 5 entry due **1 Nov 2026, 11:59 PM IST**, with an internal target of noon IST that day.

**Sources of truth:**
- [3. Product-specification-v3-mvp.md](3.%20Product-specification-v3-mvp.md): requirements, by EM-/AI-/UX-/ENG- ID
- [4. Implementation Plan.md](4.%20Implementation%20Plan.md): stack, data model, slices
- [DESIGN.md](DESIGN.md): design tokens

Requirement IDs in code comments, tests and commits refer to the spec.

## Tech stack

- Next.js 15 (App Router), TypeScript `strict`
- Tailwind CSS v4, coss ui (Base UI primitives, added through the shadcn CLI into `src/components/ui/`)
- Firebase: Auth (Google provider, plus custom tokens for the shared demo account), Firestore, Storage, App Hosting
- Gemini on Vertex AI through `@google/genai` (`vertexai: true`). The model comes from the `GEMINI_MODEL` env var
- Zod v4: domain schemas, AI contracts, env validation. `z.toJSONSchema()` generates the Gemini response schemas
- Vitest + fast-check, `@firebase/rules-unit-testing`, Playwright + `@axe-core/playwright`, Firebase emulators

## Folder structure

```
src/
  app/            routes only: pages, layouts, route handlers (api/ai/*, api/demo/session, api/internal/demo-reset)
  components/ui/  coss ui source. Restyle through tokens, not by forking logic
  features/       one folder per screen: event-create/, dashboard/, revision/, quotes/
  domain/         PURE logic: schemas, money, amount parser, allocation, guests, schedule, graph,
                  labels, diff, proposal, quote checks, fit score, alerts
  data/           repository interface + memory (tests) and Firestore (app) implementations
  lib/firebase/   client and admin initialisation, auth helpers
  server/         ai/ (pipeline, providers, prompts, schemas, refs), rate-limit, verify-token, env
  demo/           seed.ts (inputs only) and sample quotes
tests/            unit/  property/  contract/  rules/  e2e/  fixtures/ai/
docs/             architecture, setup, prompt changelog
```

How the routes map to the Figma screens:

| Route | Figma screen |
|---|---|
| `/events/new` | Event Creation |
| `/events/[eventId]` | Plan Dashboard |
| `/events/[eventId]/revise` | Revision Before/After |
| `/events/[eventId]/quotes` | Vendor Quote Comparison |

`/` signs in to the shared demo account automatically. `/welcome` is shown after sign-out.

## Coding conventions

- TypeScript `strict`. **No `any`**: use `unknown` and narrow it with Zod.
- **`src/domain/*` has zero imports from React, Next, Firebase, `fetch` or any I/O.** A lint rule (`no-restricted-imports`) enforces this. Domain functions are pure and deterministic, and take "today" as an argument.
- **Money is stored as integer minor units** (`Minor`), using the currency's ISO 4217 exponent (JPY 0, INR 2, BHD 3).
  - Never use floating-point money. Use integer or BigInt arithmetic, and largest-remainder rounding for allocations.
  - Format only at the edge, with `Intl.NumberFormat`.
- **Dates are ISO calendar strings** (`YYYY-MM-DD`) with no time or time zone. "Today" is the device's local date (EM-55).
- **Calculated values are never stored:** remaining, percentages, deadlines, statuses, alerts, quote checks and the fit score are all calculated on read.
- **Invariants that always hold:**
  - Σ line amounts + remaining = budget (remaining may be negative).
  - Per-guest amount = unit cost × guests.
  - Task dependencies never form a loop: `domain/graph.ts` → `findCycle`.
- **Every plan write** goes through the repository's version-checked transaction (EM-62), and every write increments `version`.
- Reference requirement IDs in tests and comments where a rule comes from the spec (for example `// EM-42`).

## AI integration rules

- There are exactly three AI calls: `/api/ai/plan`, `/api/ai/revise` and `/api/ai/quote`. All of them go through `src/server/ai/pipeline.ts`, which does the following in order:
  1. Verify the ID token.
  2. Check rate limits.
  3. Check the request with Zod.
  4. Build the prompt.
  5. Call the model.
  6. Validate the output with Zod **and** the rule functions (P1–P8, R1–R8, Q1–Q5).
  7. Make one repair attempt if validation fails.
  8. Return the error envelope if the repair also fails.
- **Never use AI output that hasn't passed validation.** Never display it either.
- **The AI never does arithmetic.** It returns weights, ranges and proposed operations. Code calculates every total, amount, deadline and label. AI schemas have no `label` field and no operations that change the event's budget, date or guests.
- **The AI never changes `Confirmed` lines** (EM-42):
  - Locked lines are sent to the model with `locked: true`.
  - Rule R4 drops any option that targets one.
  - `applyProposal()` asserts that confirmed lines are unchanged, and aborts the Apply if they aren't.
- Untrusted text (quotes, free-text requests) goes inside delimiters and is treated as data. Never log user text or AI text; log rule IDs only.
- Every AI call needs a fallback (spec §7.6). The plan stays usable and editable, and no AI content is ever made up.
- Tests use `FixtureProvider` (`AI_PROVIDER=fixture`). **The app refuses to start with the fixture provider when `NODE_ENV=production`** (AI-05). Fixtures live only in `tests/fixtures/ai/`.
- No AI API key exists. Vertex AI is reached through the App Hosting service account.

## Testing conventions

- **Vitest** for unit tests (`tests/unit`) and contract tests (`tests/contract`: valid fixtures plus every malformed class, and the repair path).
- **fast-check** property tests for INV-1 to INV-10 (`tests/property`), run against `src/domain` through the in-memory repository.
- **`@firebase/rules-unit-testing`** on the Firestore and Storage emulators (`tests/rules`): the owner is allowed; other users, the demo account reading a Google user's data, and unauthenticated requests are denied; `/usage/**` and `/demo/**` are closed to clients.
- **Playwright + axe** (`tests/e2e`) against the emulators with the fixture provider. These include:
  - the final acceptance test (spec §12) for INR/`en-IN`, EUR/`de-DE` and JPY/`ja-JP`, plus a variant where the AI is down
  - a keyboard-only run of the core loop
  - a 360 px layout check
- Tests never call the live model. `src/domain` needs at least 90% line coverage, enforced in CI.
- A slice isn't done until its tests pass in CI.

## Accessibility

- WCAG 2.1 AA. axe must report **0 serious or critical** violations on every screen and state.
- The core loop (create → plan → change → before/after → Apply → quotes) works with the **keyboard only**, with visible focus.
- Every status uses **text and an icon, never colour alone**. Every meter or bar shows its value as text.
- Async updates are announced with `aria-live="polite"`: AI progress and errors, parsed amounts ("Understood as ₹8,00,000"), and save state. Form errors are linked with `aria-describedby`.
- Contrast:
  - `#94A3B8` and `#EC4899` fail contrast for text. Use them only for icons and decoration.
  - Text on the rose accent uses `#a10060`.
- Respect `prefers-reduced-motion`.

## Security

- **CSP with a per-request nonce** (`src/middleware.ts`), with coss's `CSPProvider` in the root layout. No `'unsafe-inline'` scripts. Hosts allowed only for Firebase Auth and Firestore.
- `Referrer-Policy: strict-origin-when-cross-origin`, because the Firebase key's referrer restriction depends on it.
- No user or AI content is rendered as raw HTML. Raw-HTML APIs are banned by a lint rule.
- **Firestore rules isolate each user:** `users/{uid}/**` is readable and writable only when `request.auth.uid == uid`. Everything else is denied by default. Document size and types are enforced.
- **Rate limits on `/api/ai/*`**, counted in Firestore so they hold across instances:
  - Google users: 10 a minute and 100 a day per user ID.
  - Shared demo account: per IP, 10 a minute and 50 a day, plus 1,500 a day for the demo in total.
  - Overall: 2,000 a day across all users, resetting at midnight IST.
- Every API request body is validated with Zod and size-limited (100 KB).
- CI runs **gitleaks** and **`npm audit --audit-level=high`**. Only `.env.example` is committed. The Firebase web config is public by design.
- Never link the `demo-shared` account to another sign-in method (EM-60).

## Commands

```bash
pnpm dev           # Next.js dev server
pnpm build         # production build
pnpm test          # Vitest: unit, property, contract
pnpm test:rules    # Firestore/Storage rules tests on emulators
pnpm test:e2e      # Playwright + axe on emulators, AI_PROVIDER=fixture
pnpm lint          # ESLint (includes domain-purity and no-raw-HTML rules)
pnpm typecheck     # tsc --noEmit
pnpm check:size    # tracked files under 9 MB (ENG-10)
pnpm check:bundle  # after a build: first-load JS under 250 KB gzipped (ENG-11)
```

**Local machine notes:**
- New dependency build scripts must be approved with `pnpm approve-builds`.
- `pnpm test:rules` and `pnpm test:e2e` need JDK 21 or newer for the Firebase emulators. JDK 21 is installed at `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`, but `JAVA_HOME` still points at JDK 17, so set `JAVA_HOME` and `PATH` to the JDK 21 path for those runs.
- E2E runs with 2 workers (`playwright.config.ts`). More browsers at once overload the local emulators and make the auth tests flaky.

## Deployment

- **Firebase App Hosting** builds and deploys automatically on every merge to `main`. Config and env are in `apphosting.yaml`, and any secrets go in Secret Manager.
- `main` must be green in CI before merging.
- **Demo reset:** Cloud Scheduler calls `POST /api/internal/demo-reset` (verified by an OIDC token) at 3:00 AM IST. It wipes the shared demo account, writes the seed inputs, and generates the plan with live Gemini.
- Run the same reset by hand with `pnpm demo:reset` before recording the video and before submitting.
- Keep the repo under 9 MB: no build output, no media. Moodboard images go to Cloud Storage.
