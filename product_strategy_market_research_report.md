# Celebration & Event Planner SaaS — Market Validation & Product Strategy Report

## 1. Executive Summary

Your core hypothesis—that users need an **execution-oriented, connected planning system** rather than an AI idea generator—is strongly validated by market evidence. Across `r/weddingplanning`, `r/DesiWeddings`, G2, and Capterra, organizers routinely abandon consumer apps (The Knot, Zola, Joy, WedMeGood) mid-planning and revert to **Google Sheets** because existing apps treat checklists, budgets, and vendor quotes as static, disconnected silos ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/wv8tyx/i_was_using_this_budget_breakdown_from_the_knot/), [Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)).

With your four clarified parameters—**global multi-currency/cultural scope**, **authenticated `Edit`/`View` role-based sharing**, **text/DOC/PDF vendor quote ingestion (no OCR)**, and **hackathon evaluation**—your strategy sharpens significantly:

1. **Global Dynamic Localization:** Competitors hardcode US-centric or single-country templates; HoneyBook only operates in the US/Canada ([FirmTools HoneyBook Review](https://firmtools.ai/honeybook/)). Supporting any currency (e.g., USD, EUR, GBP, INR `8 lakh` per `AI-06`) and regional traditions dynamically is a high-visibility hackathon differentiator.
2. **Low-Friction Quote Comparison:** Vendors send unstructured PDFs, Word docs, and text messages with hidden taxes and service charges ([Reddit r/DesiWeddings](https://www.reddit.com/r/DesiWeddings/comments/1qjp5bh/wedmegood_for_estimates_reliable_or_not/)). Allowing users to paste text or upload `.docx`/`.pdf` files for instant LLM structured normalization removes the #1 reason users stay in spreadsheets, without the latency or failure modes of vision OCR.
3. **Deterministic + Agentic Architecture:** For hackathon judging, pure LLM math is a critical failure risk. Pairing an LLM tool-calling layer with a **deterministic constraint & budget engine** guarantees $100\%$ mathematical accuracy during the live "constraint change" acceptance test (`AI-03`, `AI-06`).

---

## 2. Competitor Matrix (Direct & Adjacent)

| Product | Segment & Target User | Key Features | Pricing (Verified 2026) | AI Features | Top Weaknesses from User Reviews (Reddit, G2, Capterra, App Stores) |
|---|---|---|---|---|---|
| **The Knot** | **B2C Consumer:** Couples planning weddings (primarily North America). | Vendor marketplace, static percentage budgeter, timeline checklist, guest list/RSVP, wedding website, registry. | **Free** for couples (monetized via vendor advertising and $2.5\%$–$3\%$ registry cash fees) ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)). | Basic AI wedding style quiz and vendor match suggestions. | **Static percentages & US lock-in:** Users complain budget percentages do not dynamically recalculate when a venue includes catering, and international users report features breaking outside the US ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/wv8tyx/i_was_using_this_budget_breakdown_from_the_knot/), [Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)). |
| **Zola** | **B2C Consumer:** Couples focused on registry, website, and guest management. | Guest list, RSVP tracking, seating chart, budget tracker, registry, vendor directory. | **Free** for couples ($2.5\%$ credit card processing fee on cash funds). | AI-assisted seating chart suggestions and automated FAQ bot for guests. | **Platform & checklist rigidity:** No native Android app; checklist tasks are generic and do not connect to budget line items or vendor quotes ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1v5kh55/favorite_wedding_website_and_why/)). |
| **Joy (WithJoy)** | **B2C Consumer:** Couples seeking digital invites, zero-fee cash registries, and multi-event RSVPs. | Multi-event RSVP logic, digital save-the-dates, wedding website, registry, basic checklist. | **Free** for couples (no platform fee on cash funds; physical registry markup). | "Ask Joy" AI writer for wedding website bios, vows, and speeches. | **Buggy UX & weak execution tools:** Frequently described on Reddit as "glitchy and complicated" with weak backend budget and vendor comparison tooling ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1v5kh55/favorite_wedding_website_and_why/), [Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)). |
| **WedMeGood** | **B2C Consumer:** South Asian families planning multi-day weddings. | Vendor directory, inspirational photo galleries, checklist, basic budget calculator. | **Free** for families; paid vendor lead-generation tiers; Genie concierge starting at $\approx \text{INR } 1,200\text{--}25,000+$. | Basic chatbot for vendor discovery/concierge routing. | **Unverified vendor pricing & lead spam:** Users report that listed "starting prices" exclude taxes, Genset, and seasonal surges by $30\%\text{--}50\%$, and inquiries trigger aggressive spam calls ([Reddit r/DesiWeddings](https://www.reddit.com/r/DesiWeddings/comments/1qjp5bh/wedmegood_for_estimates_reliable_or_not/)). |
| **Planning Pod** | **B2B Professional:** Small-to-midsize event planners, venues, and corporate teams. | Multi-event CRM, BEO (Banquet Event Order) generation, floorplans, budgets, proposals, contracts, task dependencies. | **$74 to $159/month** depending on event volume, billed annually ([Perfect Venue / Capterra](https://www.perfectvenue.com/post/planning-pod-review), [CheckThat.ai](https://checkthat.ai/brands/planning-pod)). | Minimal native GenAI; relies on manual templates and imported checklists. | **Overwhelming for families/clients:** Verified Capterra reviewers state the interface is dated and "too complicated for clients/families to collaborate in" ([Capterra Planning Pod Reviews](https://www.capterra.ca/software/125947/planning-pod)). |
| **Aisle Planner** | **B2B Professional:** Independent wedding and social event planners. | Client portal, master timeline, checklist, design studio, seating, budget tracker, vendor contracting/invoicing. | Starts at **$49.99/month** (up to $\approx \$60/\text{mo}$ depending on tier) ([The Special Wedding / Aisle Planner Pricing](https://thespecialwedding.io/compare/aisle-planner), [EverSet Review](https://www.eversetdj.com/blog/everset-vs-aisle-planner)). | None core to dynamic replanning; template-based workflows. | **Manual rework on date/budget shifts:** Changing an event date or total budget requires manual line-by-line editing across tasks and budget categories. |
| **HoneyBook** | **B2B Professional:** Solo event vendors, photographers, and coordinators. | Clientflow CRM, interactive proposals, contracts, invoicing, automated workflows, payment processing. | **Starter:** $\$29/\text{mo}$ ($\$36$ monthly); **Essentials:** $\$49/\text{mo}$ ($\$59$ monthly); **Premium:** $\$109/\text{mo}$ ($\$129$ monthly) + $2.9\% + \$0.25$ card fees ([FirmTools HoneyBook Review 2026](https://firmtools.ai/honeybook/)). | HoneyBook AI for drafting client emails, summarizing lead notes, and predicting cash flow. | **Geographically locked & vendor-centric:** Operates **only in the US and Canada**; built for vendor billing rather than family multi-category event budgeting ([FirmTools HoneyBook Review 2026](https://firmtools.ai/honeybook/)). |
| **Prismm (AllSeated)** | **B2B / Prosumer:** Venues, caterers, and planners focused on spatial layout. | 2D/3D floorplans, seating charts, capacity/accessibility validation, run-of-show timelines. | Custom enterprise pricing (historically $\approx \$149+/ \text{mo}$; exact current public figure unavailable). | AI layout auto-arrangement for tables. | **Single-point solution:** Solves spatial and accessibility layout well, but has zero budget management, task dependency, or vendor quote comparison. |
| **Partiful** | **B2C Consumer:** Gen-Z/Millennial social organizers (birthdays, casual gatherings). | Viral SMS/link invitations, guest RSVP wall, blast updates, photo sharing, co-hosting. | **Free** for organizers and guests. | AI theme/poster styling helpers. | **Zero back-office execution:** Built purely for guest RSVPs and hype; offers no budgeting, task timeline, or vendor tracking. |
| **Google Sheets + ChatGPT (DIY Stack)** | **Global Consumers & Prosumers:** The actual incumbent for execution-focused families. | Google Wedding Planner template, custom formulas, multiplayer `Edit`/`View` sharing, ad-hoc ChatGPT prompting. | **Free** (or $\$20/\text{mo}$ for ChatGPT Plus). | Ad-hoc LLM prompting in a separate browser tab. | **Context loss & formula fragility:** ChatGPT loses state across sessions and hallucinates math; Google Sheets breaks when users insert rows or try to model cascading timeline dependencies ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)). |

---

## 3. User Pain-Point Clusters (Ranked by Frequency)

Analysis of real user discussions across `r/weddingplanning`, `r/Weddingsunder10k`, `r/DesiWeddings`, G2, and Capterra reveals six recurring pain-point clusters, ranked from highest to lowest frequency:

### Rank 1: Disconnected Silos & "Static Percentage" Budget Traps
* **The Complaint:** Consumer apps pre-allocate fixed percentages (e.g., $8\%$ for flowers, $10\%$ for photography, $45\%$ for venue/catering) that do not adapt to reality. When a user books an all-inclusive venue (venue + food + bar) or cuts floral decor entirely, the app shows the venue category as "over budget" without reallocating the saved catering/bar funds or updating the checklist ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/wv8tyx/i_was_using_this_budget_breakdown_from_the_knot/)).
* **Resulting Behavior:** Users abandon the app within 2 weeks and build a custom Google Sheet.

### Rank 2: "Apples-to-Oranges" Vendor Quotes & Hidden Fee Shock
* **The Complaint:** Vendors provide quotes in wildly inconsistent formats—some quote base rates excluding $18\%\text{--}28\%$ tax/VAT/GST and $20\%$ mandatory service charges/gratuity, while others quote all-in packages ([Reddit r/DesiWeddings](https://www.reddit.com/r/DesiWeddings/comments/1qjp5bh/wedmegood_for_estimates_reliable_or_not/)). Comparing three caterers or venues requires manually reading multi-page PDFs or Word documents to spot missing items (e.g., generator backup, corkage fees, overtime rates,AV equipment).
* **Resulting Behavior:** Organizers get hit with $20\%\text{--}35\%$ budget overruns late in execution because "estimated" vs. "confirmed all-in" costs were never separated.

### Rank 3: Constraint Changes Cause Total Plan Collapse
* **The Complaint:** Event planning is highly volatile: parents reduce their contribution, guest counts jump by $30$ people, or venue availability forces the event date 6 weeks earlier. Existing tools force users to manually recalculate every task deadline and budget line item from scratch.
* **Resulting Behavior:** High cognitive overload and missed critical-path dependencies (e.g., forgetting that moving the event date earlier also moves the catering final headcount lock-in and attire alteration deadlines).

### Rank 4: Western/Single-Country Bias in Global Tools
* **The Complaint:** Global users outside the US report that mainstream tools assume a single-day Western ceremony + reception structure and US Dollar pricing ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)). They fail on multi-function celebrations (e.g., Sangeet/Mehendi/Nikah/Tea Ceremony/Rehearsal Dinner), local currencies (INR Lakhs, EUR, GBP, JPY, NGN), and regional tipping/tax norms.
* **Resulting Behavior:** Non-US organizers cannot use standard budget calculators at all.

### Rank 5: Collaboration Friction Between Co-Organizers & Family Stakeholders
* **The Complaint:** Events are rarely planned solo—couples plan with partners, parents, or community committee members. B2C apps typically only allow a single login or "co-couple" login with full admin access (risking accidental edits by relatives), while B2B portals (Planning Pod, HoneyBook) are too complex or restricted by seat caps on lower tiers ([FirmTools HoneyBook Review 2026](https://firmtools.ai/honeybook/), [Capterra Planning Pod Reviews](https://www.capterra.ca/software/125947/planning-pod)).
* **Resulting Behavior:** Users share a Google Sheet specifically because it offers simple `View` vs. `Edit` permissions.

### Rank 6: Generic, Non-Actionable AI Wrapper Outputs
* **The Complaint:** Users trying ChatGPT for event planning complain that it outputs generic "12-month countdown checklists" and hallucinated cost estimates that ignore their actual planning window (e.g., planning an event in 6 weeks vs. 14 months) and lose context after 5 prompts.

---

## 4. Core User Journey Benchmark

Below is a step-by-step comparison of your 7-step journey against the strongest incumbents, showing where competitors create friction and where your hackathon MVP has a clear opening:

| Your Journey Step | Best-in-Class Competitor Benchmark | Competitor Friction | Strategic Opening for Your SaaS |
|---|---|---|---|
| **1. User selects or describes event type & context** | **The Knot / Joy:** Rigid dropdowns (Wedding Date, City, Headcount, Total Budget). | Assumes a standard single-day event; fails on non-wedding celebrations, cultural variations, or multi-currency inputs (e.g., "8 lakh budget"). | **Natural-Language + Structured Intake:** Parse free-form descriptions *and* currency/locale automatically (supporting USD, EUR, GBP, INR Lakhs, etc.). |
| **2. System asks practical onboarding questions** | **Zola / WedMeGood:** Style quizzes ("Rustic vs. Modern") designed to sell vendor ads. | Asks aesthetic fluff rather than execution constraints (venue rules, noise curfews, dietary/accessibility needs, non-negotiable priorities). | **Diagnostic Constraint Discovery (`AI-01`):** Dynamically generate 3–5 targeted clarifying questions based on the specific event type and timeline window. |
| **3. System generates a personalized starting plan** | **Aisle Planner / The Knot:** Loads a static 100-item master template and fixed budget percentages. | A user with a 4-week timeline still gets "12 Months Out: Hire Planner" tasks; fixed percentages ignore user priorities. | **Zero-Template Synthesis (`AI-02`, `AI-06`):** Generate a budget allocation and dependency-linked timeline strictly compressed to the user's actual remaining days and budget scale. |
| **4. User refines priorities, budget, guests, theme, requirements (+ RBAC Sharing)** | **Google Sheets:** Multi-user `Edit`/`View` sharing and manual formula tweaking. | Spreadsheets lack conversational trade-off analysis; consumer apps lack granular `View`-only stakeholder sharing. | **Conversational Trade-Off Engine + Role-Based Sharing:** Let the owner invite family/stakeholders with `Edit` or `View` login permissions while AI models trade-offs ("To keep live music within your budget, here are 2 catering/decor adjustments"). |
| **5. System maintains task timeline with dependencies & deadlines** | **Planning Pod:** Tasks can be linked to milestones. | Requires tedious manual setup; consumer tools (The Knot/Zola) have zero task dependency awareness (tasks are flat checklists). | **Critical-Path Dependency Graph:** Represent tasks as a Directed Acyclic Graph (DAG) (`Venue Booked` $\rightarrow$ `Caterer Shortlist` $\rightarrow$ `Menu Tasting` $\rightarrow$ `Final Headcount Lock`). |
| **6. User records vendor quotations & compares options (Text / DOC / PDF)** | **Google Sheets / Manual Entry:** Typing line items into columns by hand. | High manual data-entry friction; users miss hidden taxes, service fees, or exclusions buried in vendor PDFs/Word docs. | **Automated Text/DOC/PDF Quote Parser:** User pastes text or uploads `.docx`/`.pdf` quotes; LLM extracts a normalized side-by-side matrix (Base Price, Taxes/Fees, Included Items, Missing/Unverified Items, Questions to Ask Vendor). |
| **7. Constraints change $\rightarrow$ System revises plan & highlights affected decisions** | **None (Major Market Gap):** Neither B2C nor B2B event tools support automated cascading revision with diff highlighting. | Users must manually hunt down every affected budget line and task deadline when budget drops or dates move. | **Visual "Plan Diff" & Impact Analyzer (`AI-03`):** Highlight affected budget categories, compressed task deadlines, and invalidated vendor quotes side-by-side (**Before vs. After**) requiring user approval before committing (`AI-09`). |

---

## 5. Feature Classification: Table Stakes vs. Differentiators vs. Gaps

| Feature (from Spec & Clarifications) | Classification | Market Rationale & Hackathon Impact |
|---|---|---|
| Event creation (occasion, date, budget, guest count, planning window) | **Table Stakes** | Expected baseline in every planning tool. Must support global currencies and date formats cleanly. |
| Categorized budget planning (`Estimated` vs. `Confirmed` separation) | **Table Stakes** | Every competitor has budget categories, though clear visual separation of *Estimated* vs. *Confirmed* is essential for execution clarity. |
| Prioritized, deadline-driven task timeline | **Table Stakes** | Expected by all users; must support list and timeline/Gantt views. |
| Role-based event sharing (`Edit` vs. `View` permissions for logged-in collaborators) | **Strategic Enabler (High Utility)** | Replaces Google Sheets' best collaboration feature. Allowing a second logged-in user to view (e.g., parents/committee) or edit (e.g., partner/co-organizer) makes the app immediately realistic for multi-stakeholder events. |
| Practical diagnostic onboarding questions before generating a plan (`AI-01`) | **Differentiator** | Competitors jump straight to static templates. Asking 3–5 smart constraint questions proves to hackathon judges that `AI-01` is genuinely implemented. |
| Global culturally & financially aware plan generation (`AI-02`, `AI-06`) | **Differentiator** | Adapting categories, terminology, and realistic unit economics whether a user inputs `$5,000 USD` in Chicago, `€15,000 EUR` in Amsterdam, or `8 Lakh INR` in Mumbai. |
| Task dependencies & cascading delay updates | **Differentiator** | Absent in consumer tools. Showing visual dependency links (`Task A blocks Task B`) directly proves your "connected system" principle. |
| Pasted Text / `.docx` / `.pdf` Vendor Quote Parser & Apple-to-Apples Comparison | **Major Differentiator** | Eliminates manual typing while avoiding OCR complexity. Automatically flagging unverified pricing, missing taxes, and suggested follow-up questions for the vendor directly fulfills `AI-08`. |
| Constraint-change simulation, trade-off explanations & Visual Plan Diff (`AI-03`) | **Killer Differentiator (Hackathon Winner)** | Directly maps to the **Final Acceptance Test** in `product-brief.md`. No incumbent shows an interactive "Before vs. After" impact diff when budget drops and the date moves earlier. |
| Sub-event / Function-level guest counts (e.g., Rehearsal/Mehendi vs. Main Event) | **Spec Gap (Recommend Adding Lightly)** | Currently missing from your spec. Even a lightweight toggle allowing an event to have 1–3 functions with distinct headcounts makes global events and budget impact math vastly more accurate. |

---

## 6. GenAI Feasibility, Architecture & Unit Economics

To satisfy **AI-01 through AI-10** and your **Text/DOC/PDF quote ingestion** requirement with high reliability and low latency during a live hackathon evaluation, you should use a **Hybrid Deterministic + Structured LLM Architecture**.

> **Critical Architectural Rule:** Never ask an LLM to perform raw arithmetic across budget arrays in free text. Instead, have the LLM output **percentage weights, structured JSON parameters, or tool calls**, and execute all addition, subtraction, tax calculation, and date-shift arithmetic in deterministic TypeScript/Python code.

### Model & Cost Assumptions (Verified 2026 API Pricing)
* **Primary Fast Model (Real-time interactive flows):** `Gemini 2.5 Flash` or `GPT-4o-mini` ($\approx \$0.15\text{--}\$0.30$ per $1\text{M}$ input tokens; $\$0.60\text{--}\$1.25$ per $1\text{M}$ output tokens).
* **Reasoning / Complex Trade-off Model:** `Gemini 2.5 Pro` or `Claude 3.7 Sonnet` / `GPT-4o` ($\approx \$1.25\text{--}\$3.00$ per $1\text{M}$ input tokens; $\$5.00\text{--}\$15.00$ per $1\text{M}$ output tokens).
* **Document Text Extraction (No OCR):** Client-side or server-side text extraction via `pdf-parse` / `pdfjs-dist` (for text-based PDFs) and `mammoth` (for `.docx`), feeding clean plain text into the LLM with Structured Outputs (JSON Schema).

| Req ID & Feature | Recommended Model & Approach | Est. Tokens / Active Event / Month | Est. Cost / Active User / Month (Estimate) | Target Latency | Known Failure Modes & Mitigation | Privacy & Regulatory Constraints |
|---|---|---|---|---|---|---|
| **AI-01:** Diagnostic onboarding questions | **Gemini 2.5 Flash / GPT-4o-mini** with Structured JSON Output generating 3–5 context-specific questions based on initial prompt. | $\approx 3\text{k}$ in / $1\text{k}$ out (1–2 runs) | $< \$0.003$ | $1.0\text{--}2.0\text{ s}$ | **Failure:** Asking generic/redundant questions already answered in Step 1.<br>**Mitigation:** Pass already-extracted entities into system prompt as an exclusion list. | Minimize PII collection during onboarding; do not require guest full names/emails at this stage. |
| **AI-02 & AI-06:** Personalized starting plan & currency/scale-aware allocations (e.g., `8 lakh` or `$10k`) | **Gemini 2.5 Flash** (with Tool Calling to a deterministic Budget Calculator) + locale/currency normalization. | $\approx 15\text{k}$ in / $6\text{k}$ out (3–5 runs) | $\$0.01\text{--}\$0.03$ | $2.5\text{--}4.5\text{ s}$ (use streaming UI) | **Failure:** LLM category allocations sum to $104\%$ or suggest luxury venues for a tight budget.<br>**Mitigation:** LLM outputs relative weights & tier (`budget`/`mid`/`premium`); deterministic code normalizes sum to exactly $100.0\%$. | **AI-08 Compliance:** Clearly badge all initial unit costs as *AI Regional Estimates — Unverified*. |
| **AI-03:** Plan adaptation on constraint change (Final Acceptance Test) | **Gemini 2.5 Pro / GPT-4o** for trade-off reasoning + **Deterministic DAG & Budget Diff Engine**. | $\approx 40\text{k}$ in / $12\text{k}$ out (5–8 revisions) | $\$0.08\text{--}\$0.22$ | $3.0\text{--}6.0\text{ s}$ | **Failure:** Silently overwriting user-confirmed vendor costs (`Confirmed` status) when recalculating.<br>**Mitigation:** Lock `Confirmed` budget items in code; only allow AI to reallocate `Estimated` categories and flag deficit warnings. | Maintain an immutable state snapshot so the user (`Edit` role) can preview and accept/reject the revision (`AI-09`). |
| **AI-04:** Natural-language requests $\rightarrow$ actionable tasks & dependencies | **Gemini 2.5 Flash** with Function Calling (`addTask`, `updateDependency`, `shiftCategoryBudget`). | $\approx 25\text{k}$ in / $8\text{k}$ out (10–15 turns) | $\$0.01\text{--}\$0.03$ | $1.2\text{--}2.5\text{ s}$ | **Failure:** Creating circular task dependencies ($A \rightarrow B \rightarrow A$).<br>**Mitigation:** Run a deterministic topological sort cycle check before saving to the database. | Enforce RBAC check on the API route: reject state-mutating AI tool calls from users with `View`-only permission. |
| **Vendor Quote Parser (Text / DOC / PDF)** | `pdfjs-dist` / `mammoth` text extraction $\rightarrow$ **Gemini 2.5 Flash** Structured JSON Schema extraction. | $\approx 50\text{k}$ in / $10\text{k}$ out (5–10 docs) | $\$0.02\text{--}\$0.05$ | $2.0\text{--}4.0\text{ s}$ | **Failure:** User uploads a scanned image-only PDF; or LLM misses hidden tax percentages.<br>**Mitigation:** If extracted text length $< 50$ chars, return a friendly UI prompt ("Scanned PDF detected—please upload a text PDF/Word doc or paste text"); prompt explicitly separates `base_cost`, `taxes_fees`, and `unverified_assumptions`. | Vendor quotes often contain phone numbers, emails, and bank details. Redact or scope access strictly to authorized event collaborators. |
| **AI-05, AI-07, AI-08, AI-09, AI-10:** Real-time execution, transparency & user control guardrails | System prompt guardrails + UI state staging (`Proposed Change` $\rightarrow$ `User Approves` $\rightarrow$ `Committed State`). | Included above | $\$0.00$ overhead | $0\text{ ms}$ | **Failure:** Hardcoded fallback responses triggering during demo.<br>**Mitigation:** Show live token streaming and explicit "Assumptions & Unverified Items" cards on every AI output. | Aligns with EU AI Act Art. 50 transparency obligations (clearly disclosing AI-generated estimates). |

* **Total Estimated GenAI Cost per Active Event per Month:** **$\$0.12\text{ to }\$0.35\text{ USD}$** (assuming 15–25 active planning sessions and 10 parsed vendor documents).
* **Total Estimated GenAI Cost for Entire Hackathon Build & Evaluation:** **$< \$5.00\text{ USD}$** (or $\$0.00$ using free-tier Gemini API / hackathon credits).

---

## 7. MVP Challenge & Risk Analysis

### Is Your MVP Scope Too Large, Too Small, or Misplaced?
For a **hackathon evaluation**, your MVP scope is **90% spot-on**, because your "Must-have modules" in `product-brief.md` map 1:1 to the acceptance criteria and the **Final Acceptance Test** that judges will use to score your submission. However, building 7 modules + RBAC sharing from scratch during a hackathon carries **UI sprawl risk** if you treat them as separate pages.

* **What to Consolidate (Do Not Build Separate Pages):** Instead of building a separate "Scenario Comparison" page and a separate "Plan Revision" page, merge them into a single **"What-If & Constraint Revision Mode"** right inside the main dashboard. When a user (or judge) changes the total budget, guest count, or event date—or types a natural-language change—the dashboard enters a **Split/Diff Staging View** showing:
  1. **Budget Impact & Trade-off Options** (Option A: Scale back decor/catering tier vs. Option B: Reduce guest count).
  2. **Timeline & Dependency Shifts** (highlighting tasks whose deadlines compressed or are now overdue).
  3. **[Apply Revision] / [Discard]** buttons (`AI-09` user control).
* **What to Keep Strictly Scoped:**
  * **Persona Selection:** While the platform supports global users and any celebration type, configure your **default demo walkthrough** around a concrete, relatable persona (e.g., a family co-planning a multi-function wedding or milestone celebration on a fixed budget like `8 Lakh INR` or `$15,000 USD`), so judges immediately see depth rather than generic breadth.
  * **RBAC Sharing (`Edit` vs. `View`):** Implement clean role-based access control where an Event Owner can invite a collaborator by email (or generate a role-scoped invite link) and toggle their role between `Editor` (can modify budget, tasks, quotes, and trigger AI revisions) and `Viewer` (read-only view of the live dashboard, timeline, and vendor comparisons, with AI mutation inputs disabled).

### Key Risks (Legal, Compliance, Privacy, Platform & Hackathon Evaluation)

1. **Hackathon Evaluation Risk — "AI Wrapper / Hardcoded Math" Disqualification (`AI-05`, `AI-06`, `AI-07`):**
   * *Risk:* Judges will test arbitrary inputs (e.g., changing an `8 lakh INR` wedding in 6 months to a `5 lakh INR` wedding in 6 weeks, or testing a `$3,500` community festival in Berlin). If the numbers don't add up or look templated, you lose points on `AI-02`, `AI-05`, and `AI-06`.
   * *Mitigation:* Display an explicit **"AI Reasoning & Assumptions" drawer** on every plan generation and revision, showing how the model adapted to the specific currency, location tier, and timeline window, while deterministic code enforces exact budget summation.
2. **Document Parsing Risk — Scanned PDFs Without OCR:**
   * *Risk:* Since OCR is out of scope, if a user or judge uploads a flattened image-only PDF, a standard PDF text parser (`pdf-parse`) will return an empty string `""`, causing the LLM to hallucinate or crash.
   * *Mitigation:* Add a deterministic pre-check: if extracted text length is $< 30$ characters, immediately display a clear, helpful message: *"This PDF appears to be a scanned image. Please upload a text-based PDF, a `.docx` file, or paste the vendor quote text directly."* Also provide 2–3 one-click **"Sample Vendor Quotes (PDF/DOCX/Text)"** right in the UI so judges can test the comparison engine effortlessly.
3. **Data Privacy & Multi-User RBAC Security (GDPR / DPDP Act):**
   * *Risk:* Vendor quotes and shared event plans contain personal data (organizer names, budgets, vendor contact details). If `View`-only enforcement is only done on the frontend (hiding buttons), a user could still mutate data via API calls.
   * *Mitigation:* Enforce `role === 'owner' || role === 'editor'` middleware checks on every `POST`/`PUT`/`DELETE` and AI mutation endpoint on the backend.
4. **Contractual / Pricing Liability Risk (`AI-08`):**
   * *Risk:* Users treating AI-estimated regional category allocations or parsed vendor quotes as legally binding all-in prices.
   * *Mitigation:* Enforce visual status badges (`AI Estimate`, `Vendor Quoted (Unverified)`, `Confirmed / Contracted`) and auto-generate a **"Questions to Verify with Vendor"** checklist for every parsed quote (e.g., *"Confirm if 18% tax and generator backup are included"*).
5. **Platform Policy Risk:**
   * *Risk:* Minimal for a web-only SaaS (`product-brief.md` explicitly scopes out native Android/iOS apps), avoiding Apple App Store 30% IAP rules.

---

## 8. Recommended Changes to Your Spec (`product-brief.md`)

Based on external evidence and your four clarifications, here are **7 concrete refinements** to incorporate into `product-brief.md`:

1. **Explicitly Define Global Multi-Currency & Cultural Adaptability (Supports Global Scope & `AI-06`):**
   * *Change:* Update the Functional Acceptance Criteria to state that an event captures **Currency / Locale** (e.g., `USD`, `EUR`, `GBP`, `INR`, etc.) and **Cultural/Regional Context**, dynamically scaling unit-cost assumptions and terminology (e.g., handling `8 lakh INR` seamlessly alongside `$12,000 USD` or `€8,000 EUR`).
   * *Evidence:* Non-US users routinely abandon The Knot and HoneyBook due to US/Canada geographic lock-in and USD-only assumptions ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/), [FirmTools HoneyBook Review](https://firmtools.ai/honeybook/)).
2. **Add Role-Based Collaboration (`Owner`, `Editor`, `Viewer`) to Functional Criteria & MVP Scope:**
   * *Change:* Add an acceptance criterion: *"An event owner can share an event with another authenticated user with either `Edit` or `View` permissions; `View` users have read-only access to the plan, budget, timeline, and vendor comparisons, while `Edit` users can modify data and trigger AI revisions."*
   * *Evidence:* Multi-stakeholder collaboration is a primary reason families revert to Google Sheets over single-login consumer apps ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/1foe3bw/withjoy_vs_the_knot/)).
3. **Specify Pasted Text, `.doc/.docx`, and Text-PDF Ingestion for Vendor Quotation Comparison:**
   * *Change:* Refine the "Vendor-quotation comparison" module in `product-brief.md` to specify: *"Users can input vendor quotes via pasted text, `.doc`/`.docx`, or text-based `.pdf` upload (no image OCR). The system extracts and normalizes base cost, taxes/fees, inclusions, exclusions/assumptions, and generates targeted follow-up questions for the vendor."*
   * *Evidence:* Eliminates manual data-entry friction and surfaces hidden taxes/exclusions that cause $20\%\text{--}35\%$ budget overruns ([Reddit r/DesiWeddings](https://www.reddit.com/r/DesiWeddings/comments/1qjp5bh/wedmegood_for_estimates_reliable_or_not/)).
4. **Lock `Confirmed` Costs During Constraint Revisions (`AI-03`, `AI-09`):**
   * *Change:* Specify in the Plan Revision logic that when constraints change (e.g., total budget decreases), the system **must never automatically alter `Confirmed` (contracted) line items**; it must only reallocate `Estimated` categories and alert the user if confirmed costs exceed the new budget.
   * *Evidence:* Prevents the #1 user frustration with automated budget tools overwriting locked deposits ([Reddit r/weddingplanning](https://www.reddit.com/r/weddingplanning/comments/wv8tyx/i_was_using_this_budget_breakdown_from_the_knot/)).
5. **Merge "Scenario Comparison" and "Plan Revision" into an Interactive "Before vs. After Diff Staging View":**
   * *Change:* Require that any constraint change (budget, date, guest count) generates a staged **Before vs. After Diff** showing affected budget categories, task deadlines, and trade-off options that the user explicitly approves or rejects (`AI-09`).
   * *Evidence:* Directly optimizes your UX for the **Final Acceptance Test** in `product-brief.md` and guarantees judges can visually verify the cascading update in seconds.
6. **Support Optional Multi-Function / Sub-Event Headcounts Within an Event:**
   * *Change:* Allow an event to optionally include sub-functions (e.g., Welcome Dinner / Mehendi for 75 guests vs. Main Reception for 200 guests) so per-head catering and venue estimates scale accurately.
   * *Evidence:* Global celebrations frequently span multiple functions with different headcounts ([Reddit r/DesiWeddings](https://www.reddit.com/r/DesiWeddings/comments/1qjp5bh/wedmegood_for_estimates_reliable_or_not/)).
7. **Mandate a Hybrid Deterministic + GenAI Architecture in Technical Notes (`AI-06`, `AI-10`):**
   * *Change:* Note in the spec that GenAI handles intent parsing, personalization, document extraction, and trade-off reasoning, while a deterministic calculation engine executes all budget summation and critical-path date arithmetic.
   * *Evidence:* Satisfies `AI-10` ("avoid using AI where it does not solve a meaningful user problem") and prevents LLM arithmetic hallucinations during evaluation.

---

## 9. Resolved Decisions & Next Implementation Steps

All four strategic questions from the initial review are now resolved:

| Parameter | Confirmed Decision | Implementation Impact |
|---|---|---|
| **1. Geographic & Cultural Scope** | **Global Users** (multi-currency, culturally adaptive across regions, including support for units like `Lakhs`, `USD`, `EUR`, `GBP`). | Currency/unit parser on intake + culturally adaptive LLM system prompt. |
| **2. Multi-User Collaboration** | **Role-Based Sharing (`Edit` vs. `View`)** for logged-in collaborators. | `event_collaborators` table `(event_id, user_id, role: 'owner' \| 'editor' \| 'viewer')` + backend RBAC middleware & read-only UI state for `viewer`. |
| **3. Vendor Quote Ingestion** | **Pasted Text, `.doc/.docx`, or Text-based `.pdf`** (No Image OCR). | Text extraction via `mammoth` (`.docx`) and `pdf-parse`/`pdfjs-dist` (`.pdf`) $\rightarrow$ Structured JSON LLM extraction + graceful guard for empty/scanned PDFs. |
| **4. Project Context** | **Hackathon Evaluation** against `product-brief.md` criteria. | Prioritize zero-latency streaming, visual "Before/After" diffing for the Final Acceptance Test, and visible AI Assumption/Confidence badges (`AI-08`). |