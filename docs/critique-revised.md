# Critique of the Gemini Report vs. Your Brief — Revised After Source Checks

*Revised 2026-10-24. This version replaces the first critique.*

## What changed from the first version

| Area | First version said | Now, after checking sources |
|---|---|---|
| Who you are competing against | Wedding apps (The Knot, Zola) | **Other entries to PromptWars Challenge 5 on Hack2Skill.** Your brief is that challenge's problem statement, and many rival submissions are public on GitHub. The report never looks at them. |
| How entries are judged | Unknown; I guessed a video | **Automated AI review of the code** in six categories: Code Quality, Security, Efficiency, Testing, Accessibility, and Problem Statement Alignment. Entries also need a public repo under 10 MB, a working deployed URL, and a demo video. *(Source: a third-party write-up of the rules. The official page wouldn't load for me, so confirm there.)* |
| Deadline | Unknown | **1 Nov 2026, 11:59 PM IST**, if you are in this edition. That is **8 days from today**, so scope is now the main constraint. |
| Multi-currency support | Rejected because it adds scope | **Still rejected as a "differentiator".** Rival entries already have currency switchers, so it is expected, not special. Keep a thin version. |
| Quote upload (DOC/PDF) | Accept pasted text; files as a stretch goal | **Upgraded.** None of the rival entries I read compare vendor quotes at all. This is your clearest difference. |
| Edit/View sharing | Rejected; I questioned the report's "single login" claim | **Still rejected for MVP. My pushback was partly wrong.** The Knot's own help center tells partners to share one login, and Zola lets you invite exactly one partner. The underlying pain is real. Building it is still wrong for this deadline and this scoring. |
| "Zola has no Android app" | I called it questionable | **Withdrawn.** Every listing I found is iOS-only. The report is probably right. |
| HoneyBook sources | Called them SEO filler | **The figures are accurate**, confirmed against a May 2026 affiliate review. They are still irrelevant to your user. |
| Aisle Planner price | Called it vendor marketing | **Worse.** One cited site doesn't exist (the domain doesn't resolve), and the other cited page contains no Aisle Planner pricing. Capterra (Mar 2026) lists $39.99–$169.99 per month by project count, not $49.99. |
| Planning Pod price | Called it vendor marketing | **Partly correct.** $74/month (10 events) is confirmed by Capterra and GetApp. $159 appears only on a competitor's page. Perfect Venue, which competes with Planning Pod, says venues pay $199–$319. The "too complicated for families" quote is not on the page it is attributed to. |
| Reddit threads | Not checked | **Still not checked.** Both of my tools are blocked from reddit.com. All 4 threads remain unverified (see the side note at the end). |

---

## 1. Conflict analysis

You added four parameters in a follow-up message to Gemini: global multi-currency, authenticated Edit/View sharing, DOC/PDF quote upload, and hackathon evaluation. I treat them as **proposed changes to your brief**. Each one is tested against your brief's principles and against the evidence. None is assumed settled.

| # | Topic | Report's claim (section) | Your brief | Evidence (checked) | Verdict |
|---|---|---|---|---|---|
| C1 | **How entries are judged** | Judges will try arbitrary inputs live, so latency matters ("zero-latency streaming") (§1.3, §7 Risk 1, §9.4) | UX-06 asks for a walkthrough video. ENG-05 says problem alignment and code quality carry the most weight | None. The report guessed. The published rules describe **automated AI review of the code** plus a deployed URL and a video | **Reject.** Your brief already matched the real rules, and the report did not. Speed of the live demo barely matters. What the AI reviewer can read in the repo matters most: tests, input validation, security headers, accessibility, and a clear mapping from each requirement to the code that implements it. |
| C2 | **Who you compete against** | Incumbent wedding apps and Google Sheets (§2, §4) | The brief asks for a solution "for this persona", with no market positioning | Not covered by the report. I read 3 of roughly 15 public Challenge 5 entries (`shubh`, `PlanIQ`, `celebrate-ai-event-planner`). All three use deterministic budget code, schedules counted back from the event date, and vendor checklists. Two let the user pick a currency. One has read-only share links. One has a propose → accept → undo flow. **None compares vendor quotes.** | **Accept as a correction to the report.** Its "differentiators" (§5) are measured against the wrong field. Against real rivals, deterministic math and multi-currency are expected. Quote comparison and a full before/after impact view are what is left to stand out on. |
| C3 | **Global multi-currency** | Support any currency and culture as a "high-visibility differentiator" (§1.1, §3 Rank 4, §5, §8.1, §9.1) | "Solve one real planning problem for one defined user". AI-06 uses "8 lakh" | Partly confirmed: HoneyBook is US/Canada only (FirmTools, May 2026), but HoneyBook is billing software for vendors, not a family planner. Rival entries already have currency switchers | **Reject global and cultural adaptation. Accept a thin version:** a currency field per event, `Intl.NumberFormat` (e.g. `en-IN` for lakh grouping), lakh/crore parsing, and no currency conversion. "Any culture" breadth works against the scoring category for Problem Statement Alignment, because the problem statement asks for a defined persona. |
| C4 | **Authenticated Edit/View sharing** | Owner, Editor and Viewer roles with checks on the server (§3 Rank 5, §5, §7, §8.2, §9.2) | Not in the brief. The final test has one user | The pain is **partly confirmed**: The Knot's help center recommends one shared login, and Zola allows one partner invite. The report cited neither; it cited a Reddit thread and Capterra | **Reject for MVP.** It is not in the problem statement and has no acceptance criterion. Each new login and permission path is more code for the AI reviewer to examine under Security. Rivals solved sharing with read-only links. With 8 days left it would compete with tests and accessibility. Optional stretch goal only, and only after the must-haves are tested: a read-only snapshot link that is stored on the server and expires. |
| C5 | **Quote upload (DOC/PDF)** | Paste text or upload `.doc`, `.docx` or text PDF (§1.2, §4.6, §5, §8.3) | EM-31 "record", EM-32 "compare", EM-33 says what the comparison must show | No rival entry I read does this. The report's `.doc` support is wrong: mammoth handles `.docx` only, per its README | **Accept, and make it your headline feature.** Pasted text and `.docx` are must-haves. Text-based PDF is a should-have. Drop `.doc`. Pull the text out **in the browser** with pdfjs-dist and mammoth, so files never reach your server. That removes a whole file-upload risk area, which matters for Security scoring. |
| C6 | Scenario comparison vs. revision | Merge them into one before/after view (§7, §8.5) | EM-15 and EM-27/28 are separate requirements | None | **Accept the merge, but keep EM-15.** A what-if must be possible without applying anything, and the user must be able to compare at least two options. Rival `celebrate-ai` already has propose → accept → undo. Yours stands out only if the before/after view covers budget, deadlines, dependencies **and** affected quotes. |
| C7 | Sub-events | Each event can have 1–3 functions with their own guest counts (§5, §8.6) | EM-01 has one guest count | Cited thread unverified. The market does this: ShaadiScheduler and VowsVibe track Mehendi, Sangeet and so on as separate events | **Investigate, with a time limit.** It is real for Indian weddings, but it multiplies the data model. Decide on day 1. Default: defer. |
| C8 | Persona | "Multi-function wedding *or* milestone… 8 lakh INR *or* $15,000" (§7) | One persona | None | **Reject the hedge.** Your brief hedges too ("wedding or small celebration"). Pick one. |
| C9 | Scope sizing | Scope is "90% spot-on" (§7) | — | — | **Reject.** The report says your scope is right while adding four items to it. |
| C10 | Platform | Says the brief excludes "Android/iOS" (§7.5) | UX-05 excludes "Android or desktop" | — | A minor misreading. No change needed. |

---

## 2. Evidence quality, after checking

"Checked" means I opened the page or an official equivalent. Reddit could not be checked.

| Claim (report section) | Cited source | What I found | Rating |
|---|---|---|---|
| HoneyBook prices $29/$49/$109 a month on annual billing; 2.9% + $0.25 card fee; US/Canada only (§2, §1) | firmtools.ai | The page says exactly this. It is an affiliate site with a disclosure, updated May 2026. It also says the Starter plan allows no team members | **Accurate, affiliate source, not relevant to your persona** |
| Planning Pod costs $74–$159 a month (§2) | perfectvenue.com, checkthat.ai | Perfect Venue competes with Planning Pod. Its page (Oct 2026) says venues pay **$199–$319** and that there is no public pricing. checkthat.ai, an analytics site that tracks AI visibility, gives "$74" via Capterra. **$159 appears only on a competitor's page** | **Low end confirmed, high end unsupported, and the sources disagree** |
| Planning Pod is "too complicated for clients/families to collaborate in" (§2, §3.5) | capterra.ca | Capterra returned 403 Forbidden, so I couldn't check the quote. Perfect Venue's complexity complaints are about **venue staff**, not families | **Unverified. Treat the quote as possibly made up** |
| Aisle Planner from $49.99 a month (§2) | thespecialwedding.io, eversetdj.com | **thespecialwedding.io does not resolve; I tried twice.** The EverSet page states **no Aisle Planner pricing**. Capterra (Mar 2026): $39.99, $69.99, $99.99, $129.99 and $169.99 for 10 to 100 projects | **Wrong figure and dead citation. A red flag for the whole competitor table** |
| Aisle Planner needs manual rework when the date or budget changes (§2) | none | The EverSet page makes no such claim | **Unsupported** |
| B2C apps allow only one login or a full-access login for the couple (§3.5) | Reddit, FirmTools, Capterra | The official help centers broadly agree: The Knot says to share one login, and Zola allows one partner invite with limits | **Probably accurate, but the report cited the wrong sources** |
| Zola has no Android app (§2) | Reddit 1v5kh55 | Only iOS listings found, and company profiles describe it as an "iOS mobile app" | **Probably accurate. My first version was wrong to doubt it** |
| No tool offers cascading revision with a diff ("Major Market Gap") (§4.7, §5) | none | `celebrate-ai` (Challenge 5) has propose → accept → undo for chat changes. AI planners like PlanMyShaadi and Aisley exist and were not reviewed | **Overstated.** A *full* before/after impact view across budget, timeline and quotes still looks uncommon, but the report never actually searched |
| Hybrid deterministic architecture is a differentiator (§1.3, §5) | none | Several entries already do this: `shubh` ("budgets that balance to the rupee"), `celebrate-ai` ("domain code owns money arithmetic"), and `Manasa-L-Hegde/celebration-planner` | **Correct engineering, but expected, not a differentiator** |
| Multi-currency is a "high-visibility differentiator" (§1.1) | none | PlanIQ supports USD, EUR, GBP, INR, CAD, AUD and JPY. `celebrate-ai` has a currency picker. `shubh` uses lakh/crore formatting | **False against your actual competition** |
| The 4 Reddit threads (1foe3bw cited about 7 times, wv8tyx, 1qjp5bh, 1v5kh55) | reddit.com | **Blocked; not checked.** A search did not surface these threads. A GummySearch summary of wedding-website reviews on Reddit is about website builders (Zola 4.5, Joy 4.6, Knot 3.9), not about budgets or international use | **Unverified. The 1foe3bw reuse pattern stays a red flag** |
| "Abandon within 2 weeks", "20–35% overruns", "30–50% surges", pain points "ranked by frequency" (§3) | none, or Reddit | No method and no counts | **Unsupported, false precision** |
| LLM pricing marked "Verified 2026" (§6) | none | It lists 2025-era models (GPT-4o-mini, Claude 3.7 Sonnet, Gemini 2.5) | **Outdated. Irrelevant at hackathon scale anyway** |
| EU AI Act Art. 50 covers estimates (§6) | none | Article 50 is about telling people they are dealing with an AI and labelling synthetic content | **Stretched** |
| mammoth reads `.doc` (§8.3, §9.3) | none | The mammoth README says ".docx documents" only | **Wrong** |
| Threshold for detecting scanned PDFs (§6 vs. §7) | — | 50 characters vs. 30 | **Contradicts itself** |

**Overall verdict on the evidence:** Of the competitor-pricing citations I could check, one site doesn't exist, one page says nothing of what is attributed to it, and two are written by competitors. The report's core validation ("strongly validated", §1) rests entirely on Reddit threads I couldn't verify. Its strategy for the contest (what to optimize, who the competitors are) was written without looking at the contest's rules or the other entries.

---

## 3. Gap analysis: what the report does not answer

**About the contest (most urgent):**
1. **The official rules.** The report doesn't cover them. I found them only in a third-party write-up. Confirm on the official Hack2Skill page: deadline, the 10 MB repo limit, deployed URL, video, the LinkedIn post, a maximum of 3 submissions, and whether a Google service (Gemini, Cloud Run, Firebase) is expected. The event is run "in collaboration with Google for Developers".
2. **How the AI reviewer scores.** The report doesn't cover this. Six categories are published with no weights. Rival READMEs include sections like "evaluation standards audit" and "problem statement alignment" written for the reviewer to read. You need a **table mapping each requirement to its code and tests** (EM-xx / AI-xx → file → test) in your README.
3. **How much testing is expected.** The report doesn't cover this. Rivals ship 113 to 324 tests, with property tests, Playwright end-to-end tests, and axe accessibility checks. Your testing plan needs to be in the brief.
4. **Where to deploy and how the API key is handled.** The report doesn't cover this.
5. **Fallback when the AI is unavailable.** The report doesn't cover this. Rivals have offline fallbacks. AI-05 forbids hardcoded AI answers, so define what the user sees on timeout or bad JSON, for example a clear error with the deterministic plan still usable.

**About the product:**

6. **Which persona.** The report doesn't cover this; see C8.
7. **Where cost estimates come from.** The report doesn't cover this. Is a small, documented table of regional cost ranges allowed, or is it "dummy data" under AI-07? `shubh` uses city-tier market ranges, so a defensible precedent exists.
8. **Where task lead times come from.** The report doesn't cover this. Whether they come from an LLM, a table, or a mix decides how deadlines compress in the final test.
9. **What EM-15 scenarios mean in practice.** The report doesn't cover this.
10. **What happens on EM-24/25** (task completed, task delayed) and on **vendor cancellation**, which your principles name. The report doesn't cover this.
11. **EM-07/EM-10** (accessibility needs, mixed-age audiences) and **EM-29/30** (defining vendor needs before quotes arrive). The report doesn't cover these.
12. **Saving without accounts.** The report doesn't cover this. The final test needs the user to return. Saving in the browser (local storage) is enough and avoids authentication altogether. Rivals do this.
13. **Rules for comparing quotes**, such as whether prices include GST and what to do when a quote doesn't state tax. The report doesn't cover this. Also add a check in code that **the extracted line items add up to the quoted total**. A mismatch is the "hidden charges" signal, and it is cheap to build.
14. **Any research with real users.** The report has none.

---

## 4. Triage of the report's recommendations (§8)

| # | Recommendation | Decision | Reason / next research |
|---|---|---|---|
| 1 | Global multi-currency and cultural adaptation | **Reject (keep a thin version)** | Rivals already have it, so it doesn't stand out. Breadth works against persona alignment. Keep: a currency field, `Intl` formatting, lakh/crore parsing, no conversion. |
| 2 | Owner/Editor/Viewer roles | **Reject for MVP** | The pain is partly real (The Knot and Zola help centers), but it is outside the problem statement, adds security surface for the AI reviewer, and competes with tests in an 8-day window. Stretch goal only: a read-only snapshot link that expires. |
| 3 | Text / DOC / PDF quote upload | **Accept, modified and promoted** | It is your clearest difference from other entries. Pasted text and `.docx` are must-haves; text PDF is a should-have; `.doc` is out. Extract text in the browser; validate the LLM output against a schema; check in code that line items add up to the total; detect scanned PDFs with one threshold; include sample quotes. |
| 4 | Lock confirmed costs during revisions | **Accept** | It follows from EM-18, EM-20 and AI-09. Ignore the report's "#1 frustration" evidence, which is made up. |
| 5 | Before/after view for changes | **Accept, modified** | Keep EM-15 as a what-if you can throw away. The view must cover budget, deadlines, dependencies and affected quotes, or it is no better than `celebrate-ai`'s preview. |
| 6 | Sub-event guest counts | **Needs research, time-boxed to day 1** | Look at 3–5 real Indian wedding catering quotes. If they price per function, add a simple list of functions (name and guest count) that drives only the catering figures. Otherwise defer. |
| 7 | Hybrid deterministic + GenAI architecture | **Accept** | Expected, not a differentiator. Back it with property-based tests so the AI reviewer can *see* the accuracy, and drop the "100% accuracy" wording. |

---

## 5. MVP verdict

**No, as written. The modules are right, but the persona is undecided and the plan has no tiers for an 8-day deadline.**

- **The modules are right.** They match the problem statement, and Problem Statement Alignment is one of the six scored categories.
- **The persona is undecided.** "Wedding or small celebration" describes two personas.
- **The brief contradicts itself.** EM-04 (many event types) conflicts with "one persona". Resolve it this way: the engine handles any event type, but tuning, test data and the demo all use one persona.
- **It isn't sized for the deadline.** Seven modules plus tests, accessibility, deployment, video and a LinkedIn post won't fit in 8 days without tiers:
  - **Must:** onboarding questions; the generated plan (budget plus a timeline with dependencies); the revision with its before/after view (this is the final test); quote comparison from pasted text and `.docx`; labels marking estimates vs. quoted vs. confirmed costs; saving in the browser; tests on the budget and date code; accessibility checks; deployment; a README with the requirement-to-code table.
  - **Should:** text PDF; what-if scenarios you can discard (EM-15 beyond the revision view); updates when a task is completed or delayed; vendor cancellation.
  - **Won't (state these as non-goals):** login and roles, global cultural adaptation, `.doc`, OCR, sub-events (unless the day-1 research says otherwise), currency conversion.
- **The Gemini additions:** accept one (quote upload, promoted), keep one in thin form (currency), defer one (sharing). The fourth, hackathon evaluation, is now the main constraint.

---

## 6. Updated outline of the brief (for your approval)

**Key:** KEEP = unchanged · EDIT = modify · ADD = new

1. **Product definition** — EDIT
   - Lock one persona. My suggestion, which is your call: an Indian family planning a wedding on ₹5–15 lakh, 2–6 months out.
   - Add the line from section 5: the engine handles any event type; tuning and the demo use one persona.
2. **Product principles** — KEEP.
3. **Evaluation and delivery constraints** — ADD
   - Deadline; AI review of the code on six categories.
   - Public repo under 10 MB; deployed URL; video; LinkedIn post; at most 3 submissions.
   - Confirm all of these against the official page.
4. **Core user journey** — KEEP. EDIT step 6: quotes can be pasted or uploaded as `.docx`/PDF. EDIT step 7: changes appear in a before/after view → the user applies or discards them.
5. **Event creation** — EDIT
   - EM-01: add a currency field with locale formatting and lakh/crore parsing.
   - EM-04/05: add the clarification above.
   - ADD saving in the browser so the user can return to the event.
6. **Personalized planning** — KEEP.
7. **Budget** — EDIT
   - EM-15: define a what-if scenario.
   - ADD cost labels: `AI Estimate` → `Vendor Quoted (Unverified)` → `Confirmed`.
   - ADD a rule: revisions never change confirmed costs, and they flag any deficit instead.
   - ADD the source of cost ranges.
8. **Timeline** — EDIT
   - ADD the source of lead times.
   - ADD a check that rejects circular task dependencies.
   - Specify what EM-24/25 change.
   - ADD vendor cancellation as a reason to revise.
9. **Vendor coordination** — EDIT
   - EM-31: pasted text and `.docx` are must-haves; text PDF is a should-have; extraction happens in the browser; scanned PDFs are rejected with guidance.
   - EM-33: list the normalized fields.
   - ADD a check in code that line items add up to the quoted total, plus tax-handling rules.
10. **GenAI requirements** — KEEP AI-01 to AI-10.
11. **Architecture** — ADD
    - Code does all money and date arithmetic.
    - The LLM returns structured proposals, validated against a schema, and never writes final values.
    - Define the failure behaviour when the AI is unavailable.
12. **UX** — EDIT. ADD the before/after view, an assumptions panel, sample quotes, and accessibility targets (WCAG AA, checked with axe).
13. **Engineering** — EDIT
    - ADD a testing plan: property tests on the budget and date code, schema tests on LLM outputs, end-to-end tests of the final scenario.
    - ADD security headers and input validation.
    - ADD a requirement-to-code-and-tests table in the README (ENG-06).
14. **MVP scope** — EDIT. Must / Should / Won't tiers as in section 5.
15. **Final acceptance test** — EDIT. Write it as a script with numbers and pass/fail checks. Example: ₹8L, 150 guests, 120 days out → ₹6L and 2 weeks earlier. It passes only if confirmed costs are unchanged, the budget sums exactly, deadlines are compressed with overdue tasks flagged, trade-offs are offered rather than applied, and nothing is saved until the user approves.
16. **Open decisions** — ADD: persona, cost source, lead-time source, sub-events, and confirmation of the official rules.

---

## Side note: Reddit

Both of my tools are blocked from reddit.com: WebFetch says it is "unable to fetch from www.reddit.com", and the browser pane refuses old.reddit.com on safety grounds. The four threads stay **unverified**. Everything the report cites only to Reddit is the following:

- the move from apps to spreadsheets
- the "static percentage" complaint
- international breakage
- WedMeGood starting prices leaving out taxes and generator costs
- Joy being "glitchy"

None of these is confirmed. If you open the threads yourself, check that **1foe3bw ("WithJoy vs The Knot")** really supports the roughly 7 different claims attached to it. I expect it doesn't.

## Sources checked

- [FirmTools HoneyBook review](https://firmtools.ai/honeybook/)
- [Perfect Venue — Planning Pod review](https://www.perfectvenue.com/post/planning-pod-review)
- [CheckThat.ai — Planning Pod](https://checkthat.ai/brands/planning-pod)
- [Capterra — Planning Pod](https://www.capterra.ca/software/125947/planning-pod) (403, not readable)
- [Capterra — Planning Pod pricing](https://www.capterra.com/p/125947/Planning-Pod/pricing/)
- [Capterra — Aisle Planner pricing](https://www.capterra.com/p/210290/Aisle-Planner/pricing/)
- thespecialwedding.io (domain does not resolve)
- [EverSet vs Aisle Planner](https://www.eversetdj.com/blog/everset-vs-aisle-planner)
- [Zola help — partner access](https://help.zola.com/hc/en-us/articles/115002422171)
- [Zola on the App Store](https://apps.apple.com/us/app/zola/id852691916)
- [The Knot help — partner access](https://helpcenter.theknot.com/hc/en-us/articles/9607120957076-The-Knot-Can-my-fianc%C3%A9-also-access-my-app-information-on-their-mobile-device)
- [mammoth.js README](https://github.com/mwilliamson/mammoth.js)
- [PromptWars Challenge 5 rules write-up (third party)](https://saurabh-12.blogspot.com/2026/10/promptwars-challenge-5-celebration.html)
- Rival entries: [shubh](https://github.com/AkTyzon/shubh), [PlanIQ](https://github.com/RiyanshiVerma-11/PlanIQ), [celebrate-ai-event-planner](https://github.com/9059Rohith/celebrate-ai-event-planner), [celebration-planner](https://github.com/Manasa-L-Hegde/celebration-planner)
- Market: [ShaadiScheduler](https://hunted.space/product/shaadischeduler), [PlanMyShaadi](https://peerlist.io/sidhanshu/project/planmyshaadi--ai-wedding-planner), [Aisley](https://getaisley.com/guides/ai-wedding-planners-uk), [GummySearch wedding-website reviews](https://gummysearch.com/tools/best-products/wedding-website/)
