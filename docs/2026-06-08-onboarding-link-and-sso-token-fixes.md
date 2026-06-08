# Onboarding link + SSO-token fixes (QA "Failed QA" investigation)

- **Date:** 2026-06-08
- **Author:** Hamza Saraswat
- **Status:** Fixes shipped; follow-ups tracked (see §8)
- **Repos touched:** `hamza-saraswat-fp/fieldpulse-onboarding-api` (this repo) · Railway env config
- **Related Linear:** BRK-346, QA-2 (and the QA-4 → QA-11 cluster)

---

## 1. TL;DR

QA marked the Onboarding Application project **"Failed QA"** after 9 tickets (QA-2, QA-4 … QA-11) all failed. Investigation found the failures were **not** product bugs — they came from **two misconfigurations in this Salesforce-facing onboarding API**:

1. **Wrong app host.** The links this service generates pointed QA at a stale/old build of the wizard on **Netlify** (`papaya-meerkat-1c6004.netlify.app`) instead of the real app on **Vercel** (`fieldpulse-onboarding.vercel.app`). Cause: the `NEXT_PUBLIC_APP_URL` env var on the Railway service was set to the old Netlify host. **Fixed** by repointing the env var.
2. **`sso_token_id` never persisted.** Salesforce sends `founderUserSsoId` in the link-gen payload, but this service wrote it only into the `salesforce_data` JSON blob — never into the dedicated `sso_token_id` column the wizard reads at Complete Setup. So the column was always `NULL`, which blocks Complete Setup. **Fixed** in code (commit `0702abc`).

Net effect: QA was testing the wrong app the whole time, and even on the right app the final "Complete Setup" step would have failed. Both root causes are now addressed.

---

## 2. Background — what QA saw

- The Onboarding Application project status was flipped to **"Failed QA."**
- 9 QA tickets, all filed by Nazar, all against `https://papaya-meerkat-1c6004.netlify.app/setup?token=…`:
  - **QA-2** — after Closed-Won, `wizard_sessions.sso_token_id` is `NULL` and `expires_at` = `2999-12-31`.
  - **QA-4** — access token not consumed, no `wizard_session` cookie.
  - **QA-5** — Microsoft Clarity CSP console error.
  - **QA-6** — General Info module data not persisted to `wizard_module_data`.
  - **QA-7 / QA-8** — module overview videos missing / descriptions don't match PRD.
  - **QA-9** — Custom Forms images don't display.
  - **QA-10** — Users-module template upload doesn't work.
  - **QA-11** — confirmation step missing / Completed page differs from PRD.

---

## 3. Investigation — how we traced it

- Every QA ticket referenced the **Netlify** host, but the onboarding app is deployed on **Vercel** (per the wizard repo's `CLAUDE.md`, `docs/architecture.md`, and the Supabase exchange-token function default `APP_URL`).
- Live header comparison confirmed they are **different apps**:
  - **Vercel** CSP: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — no analytics.
  - **Netlify** CSP: `… https://www.clarity.ms` plus **Sentry** + browser-side Supabase — a different/older codebase (Microsoft Clarity has **never** existed in the wizard repo's git history).
- The Netlify build shares the **same Supabase project**, which is why QA's SQL checks returned rows and the wrong app "sort of worked" — masking the misconfiguration.
- Salesforce screenshot (UAT, Account "Test 5") showed the Account's **Onboarding Link** field already populated with the Netlify host — i.e., **the link this API generates was itself wrong**, so QA was not testing wrong; they used the link they were given.
- Saffi (Salesforce/RevOps) confirmed SF just calls this API and doesn't set the base URL itself → the host comes from this service. The Railway service's `NEXT_PUBLIC_APP_URL` was `https://papaya-meerkat-1c6004.netlify.app`. **Smoking gun.**
- For QA-2, a DB check showed the SSO id **was present** in `salesforce_data` (`"founderUserSsoId": "37774"`) but the `sso_token_id` **column was NULL** → a column-mapping gap in this service, not a Salesforce problem.

---

## 4. Root cause #1 — wrong app host (`NEXT_PUBLIC_APP_URL`)

This service builds the onboarding link as `${NEXT_PUBLIC_APP_URL}/setup?token=<token>`
(`app/api/salesforce/generate-link/route.ts`). The env var was set to the old Netlify
build, so **every** generated link sent users to the wrong app.

**Fix:** Railway → `fieldpulse-onboarding-api` service → Variables:

```
NEXT_PUBLIC_APP_URL = https://fieldpulse-onboarding.vercel.app
```

(no trailing slash; the code appends `/setup?token=…`), then redeploy.

> ⚠️ Confirm the same value in **every** Railway environment (UAT/staging *and* production) so both the SF sandbox and SF prod generate Vercel links.

Tracked in **BRK-346**.

---

## 5. Root cause #2 — `sso_token_id` not persisted (this repo)

### What was wrong
Salesforce sends `founderUserSsoId` in the link-gen payload. The schema accepts it
(`lib/schemas/generate-link.schema.ts`) and the transform stuffs it into the
`salesforce_data` JSON blob — but the `wizard_sessions` **insert** never wrote it to the
dedicated **`sso_token_id`** column. That column was added later in the wizard repo
(migration `010`, BRK-179) and is what the wizard reads at Complete Setup to call
`POST {FP_API_BASE_URL}/authorize { sso_token_id }`. With the column `NULL`,
`completeWizard()` throws `missing_sso_token_id` and no FP submission fires.

### The change
`app/api/salesforce/generate-link/route.ts`, in the `wizard_sessions` insert — one added line:

```js
.insert({
  company_id: input.companyId,
  access_token: accessToken,
  salesforce_data: salesforceData,
  // Map the Salesforce-provided SSO id into the dedicated column the wizard
  // app reads at Complete Setup (POST /authorize { sso_token_id }). Without
  // this the column stays NULL and Complete Setup throws missing_sso_token_id.
  sso_token_id: input.founderUserSsoId ?? null,
  custom_forms_enabled: customFormsEnabled,
  status: 'in_progress',
  expires_at: NO_EXPIRATION_SENTINEL,
})
```

- **Additive and safe:** it only fills a column that was previously always `NULL`. No
  other behavior (link URL, tokens, expiry, custom-forms gating) changes.
- **Commit:** `0702abc` — *"fix: persist founderUserSsoId to sso_token_id on session create"* — pushed to `main` (Railway auto-deploys).
- Typecheck clean; no tests in the repo were affected.

---

## 6. Note on `expires_at = 2999` (QA-2, second half)

This is **intentional, not a bug.** Per the Salesforce integration spec, onboarding links
**do not expire**. Because the wizard's `wizard_sessions` migration still defines
`expires_at NOT NULL DEFAULT now() + 14 days`, this service writes a far-future sentinel
(`2999-12-31`) on insert and ignores the column on lookup (see
`NO_EXPIRATION_SENTINEL` in `route.ts` and the service README). The QA **A-001**
test case expects `now()+14d`, so that expectation should be updated — see §8.

---

## 7. How to verify (after deploy)

1. Confirm Railway redeployed `fieldpulse-onboarding-api` from `main` (commit `0702abc`).
2. Trigger a **fresh** Closed-Won on a **new** account (see the gotcha below), then check the new row:

   ```sql
   SELECT company_id, sso_token_id, status, created_at
   FROM wizard_sessions
   ORDER BY created_at DESC
   LIMIT 3;
   -- sso_token_id should now be populated (the founderUserSsoId, e.g. "37774")
   ```
3. Confirm the Account's **Onboarding Link** field now points at `fieldpulse-onboarding.vercel.app/setup?token=…`.
4. Walk the wizard end-to-end through **Complete Setup** and confirm `import_jobs` rows are written.

> ⚠️ **Gotcha:** do **not** re-use companies that already have an `in_progress` session
> (e.g. `83523` / `83655`). The route short-circuits — if a session exists it returns
> **409 "Active session exists"** with the *old* link (NULL `sso_token_id`) instead of
> creating a fresh row. Existing rows were **not** backfilled, so the clean test is a
> brand-new account/Closed-Won, which provisions a fresh row with the fix.

---

## 8. Remaining follow-ups (not in this change)

- **QA-4, QA-5, QA-6, QA-9, QA-11** — expected to pass once re-tested on the Vercel build (they only failed because QA was on the stale Netlify app). QA-10 (Users module) is **hidden by design** (Nue gate) — not a bug.
- **QA-7 / QA-8** (module overview videos + descriptions) — a real **PRD-vs-build** divergence that reproduces on the current build too; needs a product decision, not a code fix.
- **`expires_at` cleanup** — drop the `NOT NULL` / 14-day default in the wizard repo's `wizard_sessions` migration so the sentinel isn't needed; and update the QA **A-001** expectation from "now()+14d" to "does not expire."
- **FP `/authorize` validation** — populating `sso_token_id` unblocks the call, but the final proof is `/authorize` accepting the value. If it 422s, that's an FP auth-model question for Areg (ties to BRK-154).

---

## 9. Owners

- **This API service / Railway** — Hamza (owner of `fieldpulse-onboarding-api`).
- **Salesforce payload + link field** — Saffi (RevOps/Salesforce). Confirmed SF sends `founderUserSsoId` correctly; no SF change needed for the `sso_token_id` fix.
- **Wizard app + QA test plan** — Jaden (UI/test-plan author), Nazar (QA).
- **FP backend / auth model / expiry intent** — Areg.
