# Setup: Google Cloud and Firebase (one time)

These steps need the project owner's Google account. Run them once, before the first deploy.

## 1. Create the Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create a project (for example `plancraft`) and upgrade it to the **Blaze** plan (App Hosting and Vertex AI need billing).
2. **Build → Authentication → Sign-in method:** enable **Google**. Leave **Anonymous** disabled; the shared demo account signs in with server-minted custom tokens (EM-58).
3. **Build → Firestore Database:** create the database in **production mode** (region close to users, e.g. `asia-south1`). Or from the CLI: `pnpm exec firebase firestore:databases:create "(default)" --location asia-south1 --project <PROJECT_ID>`. Create it **before** the first `firebase deploy`: a deploy with no database creates one itself, in a default US region, and a Firestore location can never be changed.
4. **Build → Storage:** create the default bucket (used by the moodboard, EM-67).
5. **Project settings → Your apps:** add a **Web app**. Copy its config into `NEXT_PUBLIC_FIREBASE_*` (see `.env.example`). This config is public by design.

## 2. Create the App Hosting backend

1. **Build → App Hosting → Get started:** connect the GitHub repository, root directory `/`, live branch `main`. Every push to `main` now builds and deploys.
2. Add the `NEXT_PUBLIC_FIREBASE_*` values to `apphosting.yaml` as `BUILD`-and-`RUNTIME` variables once the web app exists (they are public, not secrets).

## 3. Grant the backend's service account its roles

App Hosting runs as `firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com`. Grant:

```bash
gcloud services enable aiplatform.googleapis.com cloudscheduler.googleapis.com --project <PROJECT_ID>
```

```bash
gcloud projects add-iam-policy-binding <PROJECT_ID> --member "serviceAccount:firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com" --role roles/aiplatform.user
```

```bash
gcloud iam service-accounts add-iam-policy-binding firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com --member "serviceAccount:firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com" --role roles/iam.serviceAccountTokenCreator --project <PROJECT_ID>
```

- `roles/aiplatform.user`: Gemini on Vertex AI, with no API key (ENG-02). The console may list it as **Agent Platform User**; check the role ID. Don't use the "Service Agent" roles.
- Also enable the Vertex AI API (`aiplatform.googleapis.com`).
- **Model and location:** `GEMINI_MODEL=gemini-3.8-flash` with `GOOGLE_CLOUD_LOCATION=global` (apphosting.yaml). On 27 Oct 2026 the current Gemini models answered only from the `global` location in this project, and `gemini-2.5-flash` no longer answered at all.
- `roles/iam.serviceAccountTokenCreator` on itself: signing the shared demo account's custom tokens (EM-58).

## 4. Restrict the Firebase web API key

In **Google Cloud console → APIs & Services → Credentials**, edit the browser key Firebase created:

- **Application restrictions:** HTTP referrers, limited to the App Hosting domain(s) and `localhost`.
- **API restrictions:** Identity Toolkit API, Token Service API, Cloud Firestore API, Cloud Storage for Firebase API.

## 5. Deploy rules

```bash
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,storage --project <PROJECT_ID>
```

## 6. Expire old rate-limit counters

Rate-limit counters (`/usage/{day}/counters/*`) carry an `expiresAt` field. Turn on a TTL policy so Firestore deletes them automatically:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=counters --enable-ttl --project <PROJECT_ID>
```

## 7. Check the client IP header after the first deploy

Demo-account AI limits count per IP (ENG-08). `TRUSTED_PROXY_HOPS` (default 2) says how many proxies append to `X-Forwarded-For` in front of the app. After the first deploy, log one request's `X-Forwarded-For` and confirm the client's address is that many entries from the right; adjust the variable in `apphosting.yaml` if not.

## 8. Nightly demo reset (slice S8)

Cloud Scheduler calls `POST /api/internal/demo-reset` at 3:00 AM IST with an OIDC token. The exact `gcloud scheduler jobs create http` command is added here in S8.
