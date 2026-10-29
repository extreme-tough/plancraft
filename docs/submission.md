# Submission texts

Drafts for the PromptWars form. Each description must be 1,024 characters or fewer (the features text is 888 and the GenAI text 884 as written), so count again after editing.

## Features (under 1,024 characters)

PlanCraft turns an event description into a budget and task plan, and keeps it right when things change. Describe the event and budget in your own words ("8 lakh", "€12.500"), answer a few questions, and get budget lines with cost ranges, tasks with dependencies and deadlines, and what to ask each vendor. Change the budget, date or guests, or ask in plain words, and a before/after view shows every affected line and task, with trade-off options; nothing changes until you press Apply, and Confirmed costs are never touched. Paste vendor quotes: hidden charges, unclear tax and other currencies are flagged, quotes are compared and given a fit score, and one can be linked and confirmed. Also: payments, a notifications bell, team notes and a moodboard. Every amount is exact in any currency, the core loop works by keyboard, and reviewers land in a shared demo account with no sign-up.

## GenAI and Google services (under 1,024 characters)

Gemini (gemini-3.8-flash) on Vertex AI makes exactly three calls: plan generation, revision trade-offs and quote extraction. Each uses JSON mode with a response schema generated from the same Zod contract the server validates against, plus rule checks (no dependency loops, no changes to Confirmed costs) and one repair attempt; output that fails is never shown. The AI never does arithmetic: it returns weights, ranges and typed operations, and code calculates every amount, total and deadline. Vertex AI is reached with the App Hosting service account, so no AI API key exists. Google services: Firebase App Hosting (Cloud Run) for the Next.js app and API, Firebase Authentication (Google sign-in and a custom-token demo account), Cloud Firestore (per-user data, rate limits), Cloud Storage (moodboard), Cloud Scheduler (nightly demo rebuilt by live Gemini). Built with Claude Code.

## LinkedIn post

I built PlanCraft for #PromptWars Challenge 5: an event planner that keeps your plan right when things change.

Most AI planners hand you a list of ideas. Real events change: the budget drops, the date moves, the guest list grows. PlanCraft turns your description into a budget and task plan. When something changes, it shows you a before/after of every line and task affected, with trade-offs to pick from. Nothing changes until you press Apply.

What I cared about:
• The AI never does the maths. Gemini proposes; code calculates every amount, so budgets add up exactly in rupees, euros or yen.
• Confirmed costs are locked. The AI can't touch them.
• Vendor quotes are read by AI and checked by code for hidden charges and unclear tax.
• It works by keyboard and passes automated accessibility checks.

Built on Google Cloud: Gemini on Vertex AI, Firebase App Hosting, Authentication, Firestore, Storage and Cloud Scheduler.

Try it (no sign-up): https://plancraft--plant-care-copilot.asia-southeast1.hosted.app
Code: https://github.com/extreme-tough/plancraft

#GenAI #Gemini #Firebase #GoogleCloud #BuildWithAI
