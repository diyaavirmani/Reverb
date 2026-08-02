# Business Workflows

These workflows implement the Reverb Fill path from owner intake through promotion activation. They import inactive, use environment-configured endpoints, and leave credentials unassigned.

Import and configure workflows `01` through `05` before workflows `10` through `14`.

## Environment

The business workflows use these n8n environment variables:

- `APP_URL`
- `N8N_INTERNAL_SECRET`
- `N8N_STORAGE_WEBHOOK_URL`
- `N8N_CHECK_PROCESSED_EVENT_URL`
- `N8N_AUDIT_EVENT_URL`
- `N8N_CONVERSATION_STATE_URL`
- `N8N_PAYMENT_LOCK_URL`
- `N8N_DISCOVERY_WEBHOOK_URL`
- `N8N_CREATIVE_WEBHOOK_URL`
- `N8N_TRANSACTION_WEBHOOK_URL`
- `N8N_ACTIVATION_WEBHOOK_URL`
- `N8N_REPORT_WEBHOOK_URL`
- `N8N_MAX_PRAVA_POLLS`
- `REVERB_FILL_SHEET_ID`
- `DEMO_SPOT_ID`

`n8n/.env.example` contains local placeholders and internal Docker URLs. Never commit `n8n/.env`.

## 10 - Campaign Intake

File: `n8n/workflows/10-campaign-intake.json`

1. **Receive Normalized Linq Event** accepts the normalized event from Next.js.
2. **Normalize Signed Input**, **Calculate Input Signature**, and **Verify Internal Signature** validate HMAC-SHA256 over `<timestamp>.<JSON body>` using `N8N_INTERNAL_SECRET`.
3. **Validate Normalized Event** requires the external event ID, conversation, sender, recipient, and text.
4. **Check Processed Event** calls workflow `01`; **Duplicate Event?** returns a safe `202` without commercial work when the ID already exists.
5. **Load Conversation State** calls workflow `03` by conversation ID.
6. **Extract Campaign Intent** calls `POST /api/ai/intent`. AI extraction does not approve spending.
7. **Merge Collected Intake Fields** copies only newly extracted values and retains prior valid values.
8. **Intake Complete?** evaluates the eight required campaign fields.
9. The incomplete branch sends exactly one question for the first missing field, then saves state. It never asks for a field already present.
10. The complete branch saves state, creates a deterministic unique campaign ID from the external event ID, and stores a `DRAFT` campaign through workflow `05`.
11. The workflow updates the campaign to `READY_FOR_DISCOVERY`, records campaign-created and ready-for-discovery audits, triggers workflow `11`, and acknowledges the owner.

Required fields are Spot, slot start, slot end, unused capacity, reservation target, maximum budget, maximum discount, and maximum expected CPA. Money is integer paise; discount is converted to basis points for the campaign record.

Fixtures:

- `n8n/fixtures/10-campaign-intake-complete.json`
- `n8n/fixtures/10-campaign-intake-missing.json`

## 11 - Provider Discovery

File: `n8n/workflows/11-provider-discovery.json`

1. **Receive Campaign ID** validates the campaign identifier.
2. The workflow loads the campaign through workflow `05` and reads the Spot, providers, and packages from their named workbook tabs.
3. It transitions to `VERIFYING_PROVIDERS` and records an audit event.
4. **Shortlist By Location And Availability** removes inactive providers and packages outside the campaign window.
5. **Verify Provider With Senso** calls `POST /api/senso/verify-provider` once per shortlisted package.
6. **Deterministic Policy And Scoring** performs every eligibility and financial check. No AI output enters this calculation.
7. **Select Deterministic Winner** sorts eligible options using score, worst-case CPA, publication time, and package ID.
8. All eligible and rejected options are stored through workflow `05`, including machine-readable rejection reasons.
9. The campaign transitions to `OPTIONS_READY`.
10. `POST /api/ai/explain-decision` explains the already-determined result. The explanation is stored as an owner-summary asset.
11. An audit event records the selected provider, package, and integer-paise price before workflow `12` starts.

### Deterministic Policy

The Code node rejects unavailable or recurring packages, over-budget prices, late deadlines, zero minimum bookings, excessive worst-case CPA, unverified or low-confidence evidence, weak local audience evidence, changed verified prices, and discounts above the campaign limit.

Worst-case CPA uses integer-safe ceiling division:

```text
ceil(pricePaise / historicalBookingMin)
```

### Exact Score Formula

Eligible packages receive component scores from 0 to 100:

```text
weighted score =
  geographic relevance * 0.30
  + expected booking potential * 0.25
  + evidence confidence * 0.20
  + cost efficiency * 0.15
  + timing and availability * 0.10
```

The fixture execution selects `package_local_dining_boost` and rejects the other two demo packages:

- `n8n/fixtures/11-provider-discovery-winner.json`

## 12 - Creative Quality

File: `n8n/workflows/12-creative-quality.json`

1. **Receive Selected Package** requires a campaign ID and the deterministic selected-package snapshot.
2. The campaign transitions to `GENERATING_CREATIVE`.
3. **Generate Selected Package Creative** calls `POST /api/ai/generate-campaign` only for that package.
4. **Run Deterministic Creative Checks** validates Spot, campaign date and time, discount, CTA, package, price, budget, CPA, deadline, and recurring billing.
5. **Review Tone And Clarity** calls `POST /api/ai/review-quality` for tone, clarity, grammar, issues, and unsupported claims.
6. **Combine Quality Results** requires both deterministic approval and AI quality approval. AI cannot override a deterministic failure.
7. The campaign transitions to `QUALITY_REVIEW`.
8. Failure records a safe `NEEDS_REVISION` audit result and stops without sending the owner an approval link.
9. Success stores the promotion-copy asset, transitions to `AWAITING_OWNER_APPROVAL`, audits the transition, and sends provider, package, price, expected bookings, expected CPA, remaining budget, selection reason, and review link through Linq.

The negative fixture matrix covers all deterministic rejection categories:

- `n8n/fixtures/12-creative-quality-cases.json`

## 13 - Prava Transaction

File: `n8n/workflows/13-prava-transaction.json`

1. **Receive Owner Approval** requires `ownerApproval: true`, campaign, approved provider, approved package, and approved integer-paise amount.
2. **Check Duplicate Callback** calls workflow `01`. Duplicate callbacks return without mutating commercial state.
3. The workflow loads the current campaign and options through workflow `05`, then loads the approved package row so provider IDs and merchant IDs are compared within their own domains.
4. **Refetch Reach Quote** calls `GET /api/reach/quote`.
5. **Rerun Deterministic Checkout Policy** rejects wrong status, changed package, changed merchant, changed price, unavailable provider, excessive budget or CPA, and invalid deadline.
6. Separate branches handle changed price, unavailable provider, and merchant/package changes before Prava or checkout.
7. An eligible campaign transitions to `PRAVA_PENDING`; an audit captures only safe provider, package, and amount facts.
8. **Create Prava Session** calls `POST /api/prava/session`. The transaction stores only safe session status and reconciliation identifiers. It does not store a one-time authorization value.
9. Linq sends the hosted approval URL.
10. **Create Bounded Poll Attempts**, **Poll Attempts**, **Poll Prava Result**, and **Wait Before Next Poll** implement bounded polling. The limit is capped at ten.
11. Separate branches handle awaiting user, declined, expired, failed, completed callbacks, and exhausted polls.
12. On authorization, **Acquire Irreversible Payment Lock** calls workflow `04` before any provider call. A blocked lock enters the duplicate-checkout branch.
13. The campaign transitions through `PAYMENT_AUTHORIZED` and `CHECKOUT_IN_PROGRESS`.
14. **Reach Checkout Exactly Once** calls `POST /api/reach/checkout` once with a stable idempotency key. The live authorization value passes directly from the Prava result to this request and is never copied into storage, audit metadata, fixtures, notes, or status messages.
15. **Require Merchant Order Before Success** prevents success without an order ID.
16. Provider exceptions enter **Checkout Reconciliation**. The workflow checks the stored transaction for a merchant order before deciding success or failure.
17. Failure retains the payment lock, reports `CHECKOUT_FAILED` to Prava with a stable idempotency key, transitions to `CHECKOUT_FAILED`, and sends a safe owner status.
18. Success stores the merchant order, completes the lock, reports `MERCHANT_ORDER_CREATED` to Prava, transitions to `ORDER_COMPLETED`, audits the order, triggers workflow `14`, and sends a safe status.

The application Prava adapter uses `MERCHANT_ORDER_CREATED` and `CHECKOUT_FAILED`; these are the safe equivalents of approved and declined checkout outcomes. A merchant-order-created report is impossible until the order ID exists.

Branch fixtures:

- `n8n/fixtures/13-prava-transaction-branches.json`

## 14 - Promotion Activation

File: `n8n/workflows/14-promotion-activation.json`

1. **Receive Merchant Order** requires campaign and merchant order IDs.
2. The workflow loads the campaign, approved asset, transaction, and order through workflow `05`.
3. **Require Order Completed Campaign** enforces `ORDER_COMPLETED` and requires all fulfillment records.
4. **Deliver Creative And Provider Brief** calls the Reach delivery endpoint with a stable delivery idempotency key.
5. Delivery success transitions the campaign to `ACTIVATING` and records `BRIEF_DELIVERED`.
6. **Activate Reach Promotion** calls the activation endpoint with a separate stable key.
7. **Require Public Activation URL** accepts only an HTTP or HTTPS URL.
8. Delivery errors, activation errors, or missing URLs transition to `ACTIVATION_FAILED`, create an audit event, and never set `ACTIVE`.
9. Success updates the merchant order and transaction, transitions the campaign to `ACTIVE`, and records `PROMOTION_SCHEDULED` and `PROMOTION_ACTIVE` after the brief-delivered audit.
10. Linq sends merchant order, provider, amount paid, activation URL, remaining budget, and a reservation tracking link.
11. The campaign-report workflow is triggered only after activation succeeds.

Fixtures:

- `n8n/fixtures/14-promotion-activation-success.json`
- `n8n/fixtures/14-promotion-activation-failure.json`

## Validation And Import

Run:

```sh
npm run validate:n8n
```

The validator checks all workflow and fixture JSON, inactive defaults, credential assignments, embedded secret values, and prohibited payment fields. After importing, assign only the Google Sheets credential to the workbook nodes and test with fixture mode before activation.
