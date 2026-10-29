# Submission texts

Drafts for the PromptWars form. Each description must be 1,024 characters or fewer (the features text is 888 and the GenAI text 884 as written), so count again after editing.

## Features (under 1,024 characters)

PlanCraft turns an event description into a budget and task plan, and keeps it right when things change. Describe the event and budget in your own words ("8 lakh", "€12.500"), answer a few questions, and get budget lines with cost ranges, tasks with dependencies and deadlines, and what to ask each vendor. Change the budget, date or guests, or ask in plain words, and a before/after view shows every affected line and task, with trade-off options; nothing changes until you press Apply, and Confirmed costs are never touched. Paste vendor quotes: hidden charges, unclear tax and other currencies are flagged, quotes are compared and given a fit score, and one can be linked and confirmed. Also: payments, a notifications bell, team notes and a moodboard. Every amount is exact in any currency, the core loop works by keyboard, and reviewers land in a shared demo account with no sign-up.

## GenAI and Google services (under 1,024 characters)

Gemini (gemini-3.8-flash) on Vertex AI makes exactly three calls: plan generation, revision trade-offs and quote extraction. Each uses JSON mode with a response schema generated from the same Zod contract the server validates against, plus rule checks (no dependency loops, no changes to Confirmed costs) and one repair attempt; output that fails is never shown. The AI never does arithmetic: it returns weights, ranges and typed operations, and code calculates every amount, total and deadline. Vertex AI is reached with the App Hosting service account, so no AI API key exists. Google services: Firebase App Hosting (Cloud Run) for the Next.js app and API, Firebase Authentication (Google sign-in and a custom-token demo account), Cloud Firestore (per-user data, rate limits), Cloud Storage (moodboard), Cloud Scheduler (nightly demo rebuilt by live Gemini). Built with Claude Code.

## Instagram Reel

**Format:** 9:16 (1080 × 1920), 20–25 seconds, with on-screen text and no voice-over. The app screens are full-screen screenshots of the live demo at phone size. Keep the media out of the repo (ENG-10).

**Brief idea (for the Reel's opening text or the form):** PlanCraft is an event planner that keeps your plan right when things change. Describe your event and budget in your own words; Gemini drafts the budget and task plan, and code checks every number. Change the budget, date or guests and you see a before/after of everything affected before you apply it. It also checks vendor quotes for hidden charges.

| # | Seconds | Visual | On-screen text |
|---|---|---|---|
| 1 | 0–3 | **Your setup photo:** your laptop with the PlanCraft dashboard open, and your phone beside it showing the mobile view | "I built an event planner that adapts when plans change" |
| 2 | 3–7 | Create-event screen ("Let's plan your celebration", with the Try-an-example chips) | "Describe your event in your own words: '₹8 lakh, 150 guests, Jaipur'" |
| 3 | 7–11 | Dashboard: the wedding card and the budget meter | "Gemini drafts the plan. Code checks every rupee." |
| 4 | 11–15 | Task timeline with "After: …" dependencies and due dates | "Tasks, dependencies and deadlines, worked out for you" |
| 5 | 15–19 | Quote card: "Gap of ₹10,000: possible hidden or missing charge" and "Fit score: 61 of 100" | "Vendor quotes checked for hidden charges" |
| 6 | 19–23 | Back to the setup photo, or the dashboard | "PlanCraft · Gemini on Vertex AI + Firebase · #PromptWars" |

**Caption:**

Plans change. Your event plan should keep up. 🎉

For #PromptWars Challenge 5 I built PlanCraft: describe your event and budget in plain words, and get a budget and task plan you can actually run. When the budget, date or guest list changes, you see a before/after of everything affected, and nothing changes until you press Apply.

✅ Gemini drafts the plan; code does every sum, in any currency
🔒 Confirmed costs are locked
🧾 Vendor quotes checked for hidden charges and unclear tax
♿ Works by keyboard, accessibility-tested

Built on Google Cloud: Gemini on Vertex AI, Firebase App Hosting, Auth, Firestore, Storage and Cloud Scheduler. Try it with no sign-up (link in bio).

#PromptWars #GenAI #Gemini #Firebase #GoogleCloud #BuildWithAI #WeddingPlanning #EventPlanning

## LinkedIn post (not used: the Instagram Reel replaces it)

I built PlanCraft for #PromptWars Challenge 5: an event planner that keeps your plan right when things change.

Most AI planners hand you a list of ideas. Real events change: the budget drops, the date moves, the guest list grows. PlanCraft turns your description into a budget and task plan. When something changes, it shows you a before/after of every line and task affected, with trade-offs to pick from. Nothing changes until you press Apply.

What I cared about:
• The AI never does the maths. Gemini proposes; code calculates every amount, so budgets add up exactly in rupees, euros or yen.
• Confirmed costs are locked. The AI can't touch them.
• Vendor quotes are read by AI and checked by code for hidden charges and unclear tax.
• It works by keyboard and passes automated accessibility checks.

Built on Google Cloud: Gemini on Vertex AI, Firebase App Hosting, Authentication, Firestore, Storage and Cloud Scheduler.

Try it (no sign-up): https://plancraft--plancraft-96a8f.asia-southeast1.hosted.app
Code: https://github.com/extreme-tough/plancraft

#GenAI #Gemini #Firebase #GoogleCloud #BuildWithAI
