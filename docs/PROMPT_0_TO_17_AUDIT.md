# Prompt 0-17 Repository Audit

Audit date: 2026-08-02

Audit scope: Reverb Fill repository state after Prompts 0-17. This was an inspection-only pass. No application code was changed.

Severity scale:

- **CRITICAL**: blocks the end-to-end demo, deployment, or payment safety.
- **HIGH**: required before real API integration.
- **MEDIUM**: should be fixed before the final demo.
- **LOW**: polish, maintainability, or documentation.

## Executive Summary

The repository contains a substantial fixture-mode MVP. The domain schemas, deterministic policy engine, provider scoring, campaign state machine, fixture repository, OpenAI/Senso/Prava adapters, Reach Exchange, reservation attribution, campaign service, and 172 automated tests are present. Fixture validation and lint complete successfully, and the tracked-file secret scan found no real-looking credentials.

Prompts 0-17 are not genuinely complete yet. Three areas are critical:

1. **CRITICAL - Linq inbound webhook is missing.** `POST /api/webhooks/linq` does not exist, so the owner-message entry point and secure n8n handoff are absent.
2. **CRITICAL - The production build fails.** Four dynamic App Router handlers use synchronous `params`, which is incompatible with Next.js 16 route types.
3. **CRITICAL - Prava credential lifecycle is unsafe on checkout failure.** The checkout is marked attempted only after a merchant order succeeds, the existing `PaymentAttemptGuard` is not integrated, and the Reach audit metadata persists `paymentAuthorisationReference`. A provider error can therefore leave the credential reusable and potentially stored.

The fixture happy path works in tests, but the repository should not proceed to real integrations until the critical and high findings below are fixed.

## What Is Complete

### Repository Structure

All expected directories exist:

- `src/app`
- `src/lib/core`
- `src/lib/adapters`
- `src/lib/repositories`
- `src/lib/security`
- `src/schemas`
- `fixtures/openai`
- `fixtures/senso`
- `fixtures/prava`
- `fixtures/linq`
- `fixtures/data`
- `fixtures/sheets`
- `docs`
- `tests`
- `n8n`
- `tableau`
- `scripts`

`fixtures/linq`, `n8n`, and `tableau` currently contain placeholders rather than functional artifacts. This is acceptable only where later prompts have not yet required those artifacts.

### Documentation

The following documents exist and contain meaningful project-specific content:

- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DEMO_SCENARIO.md`
- `docs/PAYMENT_SAFETY.md`
- `docs/PRE_EXISTING_WORK.md`
- `.env.example`
- `.gitignore`

`README.md` is not present, but it was optional in this audit scope.

### Environment And Secret Safety

- `.env` is ignored by `.gitignore` and is not tracked.
- `.env.example` contains blank placeholders rather than credentials.
- A tracked-file pattern scan found no real-looking OpenAI keys, Prava keys, JWTs, or production bearer credentials.
- The only bearer/card-pattern matches are deliberate test values in adapter/security tests.
- Runtime configuration uses Zod, defaults `USE_FIXTURES` to `true`, reports missing variable names without printing values, and redacts sensitive integration-error causes.
- No application logging of API keys, bearer tokens, phone numbers, or message bodies was found.

### Domain Schemas And Types

Strict Zod schemas and inferred types exist for all requested entities:

- Spot
- Campaign
- PromotionProvider
- PromotionPackage
- ProviderEvidence
- CampaignOption
- CampaignDecision
- CampaignAsset
- QualityReview
- OwnerApproval
- Transaction
- MerchantOrder
- PromotionActivation
- Reservation
- AuditEvent
- ConversationState
- ProcessedEvent
- PaymentLock

Money uses an integer `PaiseSchema`. UTC timestamps are validated as ISO-8601 strings ending in `Z`. Campaign, verification, payment, and order enums match the requested values. Tests reject decimal money, invalid timestamps, invalid enums, missing fields, and undeclared fields.

### Repository And Fixtures

- `StorageRepository` exposes the requested methods.
- `LocalFixtureRepository` validates complete JSON arrays before writes.
- Writes use a unique temporary file, reread and validate it, then rename it atomically.
- Campaign and audit-event duplicate IDs are rejected; campaign-option arrays reject duplicate IDs.
- The factory selects `LocalFixtureRepository` only when `USE_FIXTURES=true` and otherwise throws `live repository not configured`.
- Seed data contains one Spot, three providers, three packages, and empty commercial record files.
- All 26 JSON fixture files parsed successfully during this audit.

### Sheet Templates

All ten templates exist:

- `Spots.csv`
- `Campaigns.csv`
- `Providers.csv`
- `Promotion_Packages.csv`
- `Campaign_Options.csv`
- `Campaign_Assets.csv`
- `Transactions.csv`
- `Merchant_Orders.csv`
- `Reservations.csv`
- `Audit_Log.csv`

The validator checks required columns, duplicate headers and IDs, integer paise formatting, and row schemas. The command passed with one Spot, three providers, three packages, and empty operational sheets.

### Core Commercial Logic

- The policy engine deterministically rejects unavailable, over-budget, recurring, late, zero-booking, high-CPA, unverified, low-confidence, geography-mismatched, price-changed, merchant-changed, and package-changed options.
- Worst-case CPA uses integer-safe ceiling division.
- Provider scoring uses the required 30/25/20/15/10 weights and deterministic tie breakers.
- OpenAI is not used for financial eligibility or scoring.
- The campaign state machine prevents backwards transitions and direct payment/fulfilment skips.
- Campaign transitions produce audit events.
- Stable idempotency keys, canonical payload hashes, redaction helpers, constant-time comparison, and an in-memory payment-attempt guard exist and are tested.

### Integration Adapters

- Adapter interfaces and factories exist for OpenAI, Senso, Linq, Prava, and n8n storage.
- Fixture/live selection is centralized.
- OpenAI live calls use the official SDK and structured Zod outputs.
- OpenAI fixture schemas cover intent, decision explanation, creative, and quality review.
- Senso fixtures cover strong evidence, weak geography, and invalid deadline/CPA evidence; absent evidence returns `UNVERIFIED` with no invented sources.
- Prava fixtures cover awaiting user, authorized, declined, expired, failed, and completed states and label themselves as fixtures.
- Live integration tests use mocked HTTP/SDK clients; automated tests did not make real external calls.

### Reach Exchange

The package listing, quote, checkout, order status, delivery, and activation endpoints exist. Tests verify successful checkout, duplicate checkout returning the original order, controlled price change, unavailable package rejection, delivery-before-activation, and a public activation URL. Repository-backed audit records provide checkout idempotency.

### Reservation And Performance

The reservation and performance endpoints exist. Tests verify ACTIVE-only reservations, positive/capacity constraints, duplicate tracking rejection, visible demo labels, and performance calculations for recovered capacity, remaining capacity, spend, actual CPA, and estimated revenue using the Spot average booking value.

### Campaign Service

`CampaignService` implements all requested methods and coordinates repository interfaces, adapters, policy evaluation, scoring, state transitions, Reach Exchange, reservations, and audit events. No direct external HTTP calls were found in the service. The fixture integration test reaches `ACTIVE` without real API calls.

## What Is Missing

### CRITICAL - Linq Inbound Webhook

Missing:

- `POST /api/webhooks/linq`
- raw-body parsing
- Linq signature verification
- production rejection of unsigned requests
- fixture/development unsigned-event policy
- timestamp freshness validation
- event normalization
- external event ID preservation and deduplication
- signed forwarding to `N8N_INTAKE_WEBHOOK_URL`
- webhook route tests

There is a `ProcessedEvent` schema, but no processed-event repository or webhook idempotency implementation.

### HIGH - Linq Outbound Route And Adapter Completion

Missing:

- `POST /api/linq/send`
- outbound request schema for recipient, text, optional link, and idempotency key
- typed normalized message result route tests
- Linq fixture JSON files (`fixtures/linq` only has `.gitkeep`)
- live `sendMessage` implementation; the current live method throws `not implemented`
- webhook verification/normalization methods on the adapter or dedicated security module

### HIGH - Webhook Environment Contract

`.env.example` and runtime config do not define:

- `LINQ_WEBHOOK_SECRET`
- `N8N_INTAKE_WEBHOOK_URL`
- `N8N_INTERNAL_SECRET`

The local ignored `.env` contains these names, but application code does not consume them because the route is missing.

### LOW - README

There is no `README.md`. This does not block the fixture demo, but setup, command, fixture/live-mode, and safety instructions are not collected in one entry point.

## What Is Broken

### CRITICAL - Next.js Production Build

`npm run build` compiles JavaScript but fails Next.js route type validation. Next.js 16 expects dynamic route context params as a promise. These four handlers use the old synchronous shape:

- `src/app/api/campaigns/[campaignId]/performance/route.ts`
- `src/app/api/reach/orders/[orderId]/route.ts`
- `src/app/api/reach/orders/[orderId]/deliver/route.ts`
- `src/app/api/reach/orders/[orderId]/activate/route.ts`

After the build generated `.next/types`, `npm run typecheck` also fails on the same four routes. Before generated route types existed, standalone typecheck passed, which explains why tests did not catch the deployment failure.

### CRITICAL - Checkout Attempt Is Recorded Too Late

`CampaignService.completeMerchantCheckout` checks `checkoutAttemptedAt`, but sets it only after `ReachExchangeService.checkout` succeeds and a merchant order is loaded. If checkout throws, times out, reports a changed price, or reports provider unavailability:

- `checkoutAttemptedAt` remains null;
- the transaction remains reusable;
- the existing `PaymentAttemptGuard` is never called;
- campaign state can remain `CHECKOUT_IN_PROGRESS`;
- Prava may not receive a failed checkout outcome.

This violates the rule that a Prava credential must never be reused after any checkout attempt.

### CRITICAL - Payment Authorisation Reference Is Persisted In Audit Metadata

Reach checkout appends `paymentAuthorisationReference` to durable audit-event metadata. If this reference is the one-time Prava checkout credential, this directly violates the rule against storing payment credentials. The contract must clearly distinguish a safe reconciliation identifier from a one-time credential, and the one-time value must never enter repository, audit, logs, or error objects.

### HIGH - Expired Owner Approval Is Accepted

`requireApproval` checks only `status === APPROVED`; it does not compare `expiresAt` with the current time. `createPaymentSession` can therefore proceed with an expired approval. It also does not explicitly require campaign status `PRAVA_PENDING`.

### HIGH - Local Environment Names Do Not Match Runtime Config

The ignored local `.env` uses generic names such as `OPENAI_MODEL`, `SENSO_API_BASE`, `LINQ_API_BASE`, `PRAVA_API_BASE`, and `PRAVA_SECRET_KEY`. Runtime config expects per-operation OpenAI model names plus `*_BASE_URL`, `PRAVA_API_KEY`, endpoint templates, and n8n API variables. `USE_FIXTURES=true` works, but switching the current file to live mode would fail configuration validation.

## What Is Risky

### HIGH - Merchant Operations Are Not Uniformly Idempotent

Checkout has a stable idempotency key and request-hash conflict detection. Delivery and activation accept no idempotency key. Activation is effectively repeat-safe, while repeated delivery rewrites deterministic asset IDs and appends another delivery audit event. All merchant operations should have an explicit idempotency contract and tests.

### HIGH - Dependency Audit Reports Three High-Severity Vulnerabilities

`npm ci` reported three high-severity vulnerabilities. `npm audit` attributes them to the direct `next` dependency through vulnerable `postcss` and `sharp` versions. The suggested automatic fix is an unsafe major downgrade, so dependency remediation needs manual version research and verification rather than `npm audit fix --force`.

### MEDIUM - JSON Fixture Validation Command Is Incomplete

`scripts/validate-fixtures.ts` checks only that fixture directories exist. JSON files are parsed indirectly by tests/adapters, and all 26 parsed during this audit, but `npm run validate:fixtures` does not itself schema-validate every JSON fixture or reject duplicate IDs across all fixture collections.

### MEDIUM - Deterministic Creative Quality Checks Are Partial

The quality function verifies Spot/date/CTA presence and validates source data limits for discount, budget, provider activity, package identity, CPA, and deadline. It does not verify that provider/package/CPA/deadline facts appearing in creative are present and accurate, and the campaign-service test covers only the passing fixture. Negative deterministic-quality tests are missing.

### MEDIUM - Fixture File Writes Have No Cross-Process Lock

Writes are atomic at the file replacement level, but simultaneous writers can read the same old array and overwrite each other's updates. This is acceptable for a single-process fixture demo but unsafe for concurrent development requests.

### LOW - Lint Warnings

Lint exits successfully with 13 unused-import/unused-variable warnings across adapter, reservation, and test files. There are no lint errors.

## Security/Secrets Findings

Verified safe:

- `.env` is ignored and untracked.
- `.env.example` has blank values.
- No real-looking tracked API keys or JWTs were found.
- Integration errors redact keys containing card, CVV, token, secret, authorization, credential, expiry, PAN, and password.
- Live credentials are sent server-side and are not included in request bodies.
- Tests use obvious test-only bearer/card values.

Required fixes:

- **CRITICAL:** remove the Prava checkout credential/reference from Reach audit metadata unless it is formally proven to be a non-secret reconciliation ID.
- **CRITICAL:** consume/mark the Prava credential before the provider checkout call and block all reuse after success, rejection, timeout, or exception.
- **HIGH:** enforce owner-approval expiry before session creation and checkout.
- **HIGH:** add Linq HMAC validation, production unsigned-request rejection, timestamp freshness, redacted logging policy, and signed n8n forwarding.
- **HIGH:** align live environment variable names without copying real values into tracked files.

## API Route Inventory

Present:

- `GET /api/health`
- `POST /api/ai/intent`
- `POST /api/ai/explain-decision`
- `POST /api/ai/generate-campaign`
- `POST /api/ai/review-quality`
- `POST /api/senso/verify-provider`
- `POST /api/prava/session`
- `GET /api/prava/result`
- `POST /api/prava/report`
- `GET /api/reach/packages`
- `GET /api/reach/quote`
- `POST /api/reach/checkout`
- `GET /api/reach/orders/[orderId]`
- `POST /api/reach/orders/[orderId]/deliver`
- `POST /api/reach/orders/[orderId]/activate`
- `POST /api/reservations`
- `GET /api/campaigns/[campaignId]/performance`

Missing:

- **CRITICAL MISSING:** `POST /api/webhooks/linq`
- **HIGH MISSING:** `POST /api/linq/send`

## Missing Tests

- Linq valid signature, invalid signature, stale timestamp, fixture signature, unsigned production rejection, malformed JSON, missing event ID, duplicate ID, n8n-not-configured, and signed forwarding tests.
- Linq outbound validation, fixture result, idempotency-key, and channel-selection tests.
- Next.js production route-type/build regression coverage.
- Checkout exception/timeout tests proving the Prava credential is consumed before the provider call.
- Tests proving payment credentials never enter audit/repository records.
- Expired owner-approval and wrong-campaign-status payment tests.
- Delivery and activation idempotency-key/conflict tests.
- Negative deterministic creative-quality tests for provider, package, discount, CPA, and deadline claims.
- Comprehensive JSON fixture schema validation tests tied to `npm run validate:fixtures`.
- Live-mode configuration tests using the intended final environment variable names.

## Failed Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | FAIL in final repository state | Initially passed before Next generated route types; after `next build`, fails on four dynamic route handlers. |
| `npm run lint` | PASS with warnings | 0 errors, 13 warnings. |
| `npm run validate:fixtures` | PASS | Directories and all ten sheet templates validated. |
| `npm run test` | PASS | 17 files, 172 tests. |
| `npm run build` | FAIL | Next.js 16 dynamic route `params` type incompatibility. |

Additional command findings:

- `npm ci`: completed, but reported three high-severity dependency vulnerabilities.
- Explicit JSON parse audit: 26 files checked, 0 malformed.
- Tracked secret-pattern audit: no real-looking secrets found; matches were test-only values.

## Recommended Fix Order

1. **CRITICAL:** repair all four Next.js 16 dynamic route signatures and require typecheck plus build to pass.
2. **CRITICAL:** implement the inbound Linq webhook, processed-event deduplication, HMAC verification, timestamp freshness, and signed n8n forwarding.
3. **CRITICAL:** repair Prava credential consumption and remove credential material from durable Reach audit metadata.
4. **HIGH:** enforce owner-approval expiry and campaign state before Prava session/checkout operations.
5. **HIGH:** implement the outbound Linq send route, fixtures, live adapter, and tests.
6. **HIGH:** align `.env.example`, runtime config, and local variable names; keep values blank in tracked files.
7. **HIGH:** add explicit idempotency to Reach delivery and activation.
8. **HIGH:** research and upgrade the vulnerable Next/PostCSS/Sharp dependency chain without using a forced downgrade.
9. **MEDIUM:** extend fixture validation and deterministic creative-quality negative tests.
10. **LOW:** remove lint warnings and add a concise README.

## Exact Next Codex Prompts Needed

Run these prompts in order and stop after each one passes its requested checks.

### Prompt A - Repair Next.js 16 Dynamic Routes

```text
Read AGENTS.md and docs/PROMPT_0_TO_17_AUDIT.md.

Fix only the Next.js 16 dynamic App Router context incompatibilities in:
- src/app/api/campaigns/[campaignId]/performance/route.ts
- src/app/api/reach/orders/[orderId]/route.ts
- src/app/api/reach/orders/[orderId]/deliver/route.ts
- src/app/api/reach/orders/[orderId]/activate/route.ts

Use the Next.js 16 Promise-based params contract and await params before reading campaignId or orderId. Do not change route behavior.

Run npm run typecheck, npm run test, and npm run build. Stop after all pass and summarize changed files.
```

### Prompt B - Implement Linq Inbound And Outbound Routes

```text
Read AGENTS.md and docs/PROMPT_0_TO_17_AUDIT.md.

Implement the missing Linq scope:
- POST /api/webhooks/linq
- POST /api/linq/send
- src/lib/adapters/linq/normalize.ts
- src/lib/security/webhook-signature.ts
- fixture records under fixtures/linq

The webhook must read the raw body, safely parse JSON, preserve the external event ID, verify HMAC signatures when LINQ_WEBHOOK_SECRET is configured, reject unsigned production requests, reject stale timestamps, allow unsigned test events only in fixture/non-production mode, normalize the event, deduplicate by external event ID, and forward to N8N_INTAKE_WEBHOOK_URL with an HMAC made from N8N_INTERNAL_SECRET. If the n8n URL is absent, return a safe local-mode 202. Never log complete phone numbers, message contents, bearer tokens, or secrets.

The send route must accept recipient, text, optional link, and idempotency key, call LinqAdapter without forcing iMessage, RCS, or SMS, and return a validated typed result.

Add the webhook and outbound tests listed in the audit. Update .env.example and runtime config with blank placeholders only. Tests must mock all network calls.

Run npm run typecheck, npm run lint, npm run test, and npm run build. Stop after all pass.
```

### Prompt C - Repair Payment Credential Lifecycle

```text
Read AGENTS.md, docs/PAYMENT_SAFETY.md, and docs/PROMPT_0_TO_17_AUDIT.md.

Fix only the audited Prava and checkout safety gaps.

Requirements:
- reject expired owner approval before creating a payment session or checking out
- require the correct campaign status for each payment operation
- mark the Prava credential consumed/checkout attempted before calling the provider
- integrate PaymentAttemptGuard or a repository-backed PaymentLock so all retries are blocked after any provider call begins
- mark completed or failed in every success/exception path
- do not persist paymentAuthorisationReference or any one-time credential in transactions, audit metadata, logs, errors, or n8n records
- retain only explicitly non-secret reconciliation IDs
- on timeout or exception, check merchant order state before claiming success or failure
- report checkout failure to Prava with a stable idempotency key when safe
- preserve the rule that success cannot be reported before a merchant order exists

Add tests for provider failure, timeout, credential non-reuse, credential non-persistence, expired approval, duplicate calls, and merchant-order reconciliation.

Run npm run typecheck, npm run lint, npm run test, and npm run build. Stop after all pass.
```

### Prompt D - Complete Merchant Idempotency And Environment Contract

```text
Read AGENTS.md, docs/PAYMENT_SAFETY.md, and docs/PROMPT_0_TO_17_AUDIT.md.

Add explicit stable idempotency keys and conflict detection to Reach order delivery and activation. Repeated identical operations must return the original result without duplicate commercial state changes; a reused key with a different payload must return a conflict. Add focused tests.

Then align runtime-config.ts and .env.example with the final OpenAI, Senso, Linq, Prava, and n8n variable names. Never read, print, copy, or commit values from .env. Add configuration tests for fixture mode, complete live mode, and missing live variables.

Run npm run typecheck, npm run lint, npm run test, and npm run build. Stop after all pass.
```

### Prompt E - Harden Validation And Dependency Health

```text
Read AGENTS.md and docs/PROMPT_0_TO_17_AUDIT.md.

Extend npm run validate:fixtures so it schema-validates every JSON fixture under fixtures/data, fixtures/openai, fixtures/senso, fixtures/prava, and fixtures/linq, rejects duplicate IDs where applicable, and keeps the concise sheet report. Add tests for malformed JSON and schema-invalid fixtures.

Add negative campaign quality tests for inaccurate or missing Spot, date, discount, budget, provider, package, CPA, deadline, and CTA facts.

Research the current Next.js-supported upgrade path that resolves the reported PostCSS and Sharp advisories. Do not use npm audit fix --force and do not downgrade Next.js. Apply only a compatible dependency update, then run npm audit, npm run typecheck, npm run lint, npm run validate:fixtures, npm run test, and npm run build.

Stop after summarizing changed files, command results, and any remaining advisory that cannot be safely resolved.
```
