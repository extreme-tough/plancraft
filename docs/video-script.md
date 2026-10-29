# Walkthrough video script (UX-06)

**Goal:** show every MUST feature, the final acceptance test (spec §12) and the AI-failure fallback, in about 4–5 minutes. No voice-over is needed (UX-07). Use captions for each scene.

**Before recording:**

1. Run `pnpm demo:reset`, so the demo event has a fresh live plan.
2. Use a private browser window at 1280 × 800.
3. Record from the live URL: https://plancraft--plant-care-copilot.asia-southeast1.hosted.app
4. Don't upload the video to the repo (ENG-10). Use unlisted YouTube or Google Drive.

| # | Scene | Steps | Caption | Shows |
|---|---|---|---|---|
| 1 | Reviewer entry (D0) | Open the URL | "No sign-up: reviewers land in a shared demo, rebuilt nightly by live Gemini" | EM-58, EM-63, UX-10 |
| 2 | Create an event (D1) | Create an event, click "Try an example" (Jaipur wedding), type "8 lakh" in the budget, and point at "Understood as ₹8,00,000". Continue to the questions, pick priorities and add an accessibility need | "Budgets in your own words, read back before saving" | EM-01, EM-02, EM-05, EM-37, EM-38 |
| 3 | Generate the plan | Generate my plan. Open the Assumptions panel and one line's range and vendor needs | "Gemini proposes; code does every sum" | AI-01, EM-03, EM-11, EM-14, EM-19, EM-21, EM-29, UX-09 |
| 4 | Edit and confirm | Edit the venue line to ₹2,50,000 and confirm it. Mark a task done and watch "Next up" change | "Only you can confirm a cost" | EM-13, EM-16, EM-20, EM-22, EM-24, EM-26 |
| 5 | The final test (D2) | Change budget, date or guests: type "6 lakh" and move the date 14 days earlier. Show the before/after: budget ₹8,00,000 → ₹6,00,000, the shortfall, deadlines 14 days earlier, compressed tasks and "Reconfirm for new date" on the venue | "Nothing changes until Apply" | EM-27, EM-52, EM-53, §12 assertions 2–3 |
| 6 | Trade-offs and Apply | Show at least 2 options, none selected. Pick one, then Apply. Show that the venue is still ₹2,50,000 and Confirmed, and that the totals add up | "Confirmed costs are locked; the totals always add up" | EM-42, EM-44, EM-54, §12 assertions 4–6 |
| 7 | Free-text change (D3) | Ask for a change: "The photographer is too expensive, and we'd rather have a DJ than a live band". Show the interpretation and options, then Discard | "Plain-language changes become checked operations" | EM-08, EM-09, AI-03, AI-04, EM-53 |
| 8 | Quotes (D4) | Compare quotes for Catering. Add the "Hidden charge" sample and the "Unclear tax" sample. Show the gap, "Tax treatment unclear", the questions, the comparison table and the fit score. Link one quote, then confirm it | "Quotes are read by AI and checked by code" | EM-30 to EM-36, EM-41, EM-49 to EM-51, EM-68 |
| 9 | AI failure (D5) | The AI-down variant can't be forced on the live URL without changing it. Show the Playwright AI-down test passing (`final-acceptance.spec.ts`) or a local run with the revision call failing: the error with Retry, and the change calculated by code still applies | "When the AI is down, the plan still works" | AI-12, §12 assertion 9 |
| 10 | Keyboard and accessibility (D6) | Tab through a revision to Apply with visible focus. Show a status with text and an icon | "Keyboard only, WCAG 2.1 AA" | UX-11, UX-12 |
| 11 | Extras | The notifications bell, a payment on a line, team notes, the moodboard (sign in with Google to upload) | "Payments, alerts, notes and a moodboard, all calculated by code" | EM-64 to EM-67 |
| 12 | Accounts and sharing (D7, D8) | Sign in with Google: your events are private. Optionally show two demo windows, where a stale edit is refused rather than lost | "Your data is yours; shared edits are never silently lost" | EM-57, EM-59, EM-62 |
| 13 | Close | The README's requirement table and a green CI run | "Every requirement mapped to code and a test" | ENG-01, ENG-09 |
