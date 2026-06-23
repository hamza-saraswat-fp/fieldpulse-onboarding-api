# QA-52 — Reuse the existing onboarding link for already-onboarded companies

- **Date:** 2026-06-23
- **Author:** Hamza Saraswat
- **Status:** Fix shipped — PR #1, merged to `main` → Railway auto-deploy
- **Repo touched:** `hamza-saraswat-fp/fieldpulse-onboarding-api` (this repo)
- **Related Linear:** QA-52
- **Commit:** `c43ab5c` (branch `fix/qa-52-link-reuse`)

---

## 1. TL;DR

When Salesforce regenerates an onboarding link for a company that has **already onboarded**, this API
was minting a **brand-new** `?token=…` and a **new `wizard_sessions` row** instead of returning the
company's existing link. Root cause: `generate-link` deduped **only** `in_progress` sessions, so a
`completed` company fell through to the insert path.

The fix broadens the lookup to **any non-expired session** and returns its link. For older completed
sessions whose `access_token` had been nulled (pre-QA-36 replay-prevention behavior), the token is
**refreshed on the existing row** rather than minting a new session — so every completed company gets a
stable, working link with **zero duplicate rows**.

---

## 2. Background — what the ticket reported

**QA-52 repro:** complete onboarding + submit → in Salesforce, delete the used link → click "Generate
Onboarding link" again → a **new** `?token=…` is produced, different from the original.

Expected: the same company should get the **same** link back (idempotent link generation), not a fresh
token and a duplicate session each time SF regenerates.

---

## 3. Investigation — how we verified

Two independent sources were checked: the route source, and the **live shared database** (because the
original plan doc made claims about DB state — "migration 012", "completed tokens kept live" — that
needed verifying against reality rather than the source repos).

### 3.1 Code trace

`app/api/salesforce/generate-link/route.ts` looked up an existing session with:

```ts
.select('id, access_token')
.eq('company_id', input.companyId)
.eq('status', 'in_progress')      // ← only in_progress
.order('created_at', { ascending: false })
.limit(1)
.maybeSingle()
```

A `completed` (or `submission_failed`) session does not match `status = 'in_progress'`, so the lookup
returns nothing → the handler falls through to `crypto.randomUUID()` + `INSERT`, minting a new session
and link. Confirmed root cause.

### 3.2 Live DB checks (`Implementation_App`, ref `rqelncbqgepyardwtltc`)

The whole fix hinges on whether a completed session still has a usable `access_token` to return. Two
read-only queries settled it:

```sql
-- access_token nullability
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'wizard_sessions'
  and column_name = 'access_token';
-- → is_nullable: YES

-- per-status live-vs-null token breakdown
select status,
       count(*)                                         as total,
       count(*) filter (where access_token is not null) as has_token,
       count(*) filter (where access_token is null)     as null_token
from public.wizard_sessions
where status = 'completed'
group by status;
```

Result:

| status    | total | has_token | null_token |
| --------- | ----- | --------- | ---------- |
| completed | 68    | 37        | 31         |

**Findings:**

- `access_token` **is nullable** in the live DB — so reusing a session row is safe.
- Of 68 completed companies, **37 have a live token and 31 (46%) have a null token.** The null-token
  case comes from the pre-QA-36 behavior that nulled `access_token` after first exchange (replay
  prevention). QA-36/37 stopped that going forward — hence the 37 live tokens — but ~46% of completed
  companies are the historical backlog.

### 3.3 Corrections to the original plan doc (`qa-52-link-reuse-plan.md`)

- **"Migration 012" does not exist.** This repo has no migrations directory, and the live DB tracks no
  migrations (`list_migrations` → `[]`). The nullable column is real, but not via any "012".
- **Null tokens are not a rare edge case.** The plan treated them as a pre-QA-36 rarity and fell them
  through to "mint a fresh one" — which re-creates exactly the duplicate-row + new-link churn QA-52 is
  about, for **46%** of completed companies. This fix handles that path explicitly (see §5).

---

## 4. Root cause

`generate-link` treated "an existing session worth reusing" as **`status = 'in_progress'` only**.
Completed companies therefore always regenerated, producing duplicate sessions and rotating links.

---

## 5. The fix

Single file: `app/api/salesforce/generate-link/route.ts`. No new imports or utilities — reuses
`crypto.randomUUID()`, `createAdminClient()`, the `log` logger, and the existing 409 response shape.

**Edit 1 — broaden the lookup.** Add `status` to the select and reuse any non-expired session:

```ts
.select('id, access_token, status')
.eq('company_id', input.companyId)
.neq('status', 'expired')          // in_progress | completed | submission_failed
.order('created_at', { ascending: false })
.limit(1)
.maybeSingle()
```

`.neq('status','expired')` is future-proof: only genuinely expired sessions regenerate; everything else
is reused. `status` is `NOT NULL`, so `.neq` has no null-handling pitfalls.

**Edit 2 — reuse, refreshing the token when it's null:**

```ts
if (existingSession) {
  let reuseToken = existingSession.access_token
  if (!reuseToken) {
    // Pre-QA-36 completed session whose token was nulled on first exchange.
    // Refresh the token on the SAME row instead of INSERTing a new session, so we
    // return a working link without re-creating the duplicate-row churn QA-52 is about.
    reuseToken = crypto.randomUUID()
    const { error: refreshError } = await supabase
      .from('wizard_sessions')
      .update({ access_token: reuseToken })
      .eq('id', existingSession.id)
    if (refreshError) {
      log.error('Failed to refresh access_token for existing session:', refreshError.message)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    log.info('Refreshed null access_token for existing session:', existingSession.id)
  }
  const existingLink = `${appUrl}/setup?token=${reuseToken}`
  log.info('Reusing existing session for companyId:', input.companyId, 'sessionId:', existingSession.id)
  return NextResponse.json(
    { error: 'Active session exists', existingLink, sessionId: existingSession.id },
    { status: 409 },
  )
}
```

**Edit 3 — the INSERT path is unchanged.** It now runs only when a company has no non-expired session
(truly new, or previously expired).

---

## 6. Why "refresh on the existing row" instead of "mint a fresh one"

The original plan returned a new token via the normal **INSERT** path for null-token sessions. That
creates a second `wizard_sessions` row and a different link — i.e. it reproduces the QA-52 symptom for
46% of completed companies.

Refreshing the token on the **existing** row keeps **one session per company**: the link works again,
no duplicate row is created, and `generate-link` becomes genuinely idempotent. This is consistent with
the current security posture — the 37 post-QA-36 completed companies already retain reusable tokens, so
re-enabling a link for the 31 older ones is not a new exposure.

---

## 7. Verification

This repo has **no test framework** (only `dev`/`build`/`start`/`lint` scripts), so verification is via
type-check and live behavior:

- **Static:** `npm run build` passes — "Compiled successfully" and the type-check step is green.
  (`npm run lint` is unrelated-ly broken — `next lint` with no ESLint installed drops into an
  interactive setup wizard; see §8. `next build` does the TypeScript check regardless.)
- **Reuse is idempotent:** call `generate-link` twice for a completed test company → expect HTTP **409**
  + the **same** `existingLink` both times, and **no new `wizard_sessions` row**.
- **Null-token refresh:** pick a completed company from the 31 null-token rows → call `generate-link` →
  409 with a working link, and that row's `access_token` is now populated (not a new row).
- **DB checks:** row count for the test company is unchanged before/after; the duplicate query
  (`group by company_id having count(*) > 1`) gains no new entries.

---

## 8. Follow-ups / out of scope

- **409 vs 200 for the reuse case.** The 409 + `existingLink` shape is unchanged, so Salesforce handling
  stays the same. Whether SF would prefer a clean 200 for reuse is an open question for Saffi — not
  changed here, since it alters the link-gen contract.
- **Dedupe pre-existing duplicate rows.** This fix stops *new* duplicates but does not clean up rows
  already created by the old behavior. A one-time cleanup (collapse each company to its
  completed/most-meaningful session) is a separate data task.
- **`npm run lint` is not configured.** The `lint` script is `next lint`, but the repo has no ESLint
  config and neither `eslint` nor `eslint-config-next` is installed, so it can only trigger the
  first-run setup wizard. Pre-existing, unrelated to this change. Fix path: migrate to the ESLint CLI
  (`npx @next/codemod@canary next-lint-to-eslint-cli .`) or install `eslint` + `eslint-config-next` with
  a minimal config. Tracked separately so it stays out of this PR.
