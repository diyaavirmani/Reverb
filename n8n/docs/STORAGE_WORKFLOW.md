# Storage Gateway Workflow

File: `n8n/workflows/05-storage-gateway.json`

The storage gateway exposes `POST /webhook/reverb/storage`. It verifies a timestamped HMAC-SHA256 signature using `N8N_INTERNAL_SECRET`, validates each operation against an allowlist, routes to the corresponding Google Sheets node, and returns one consistent JSON envelope.

## Required Workbook

Create a Google Sheets workbook named `Reverb_Fill_Operations`. Import the CSV templates from `fixtures/sheets` without renaming tabs or columns.

| Sheet | Required columns |
| --- | --- |
| `Spots` | `id`, `ownerId`, `name`, `category`, `averageBookingValuePaise`, `timezone`, `addressLine1`, `addressLine2`, `addressCity`, `addressRegion`, `addressPostalCode`, `addressCountryCode`, `createdAt`, `updatedAt` |
| `Campaigns` | `id`, `spotId`, `requestedByOwnerId`, `status`, `requestSummary`, `slotStartAt`, `slotEndAt`, `unusedCapacity`, `targetReservations`, `maxBudgetPaise`, `maxDiscountBps`, `maxExpectedCpaPaise`, `createdAt`, `updatedAt` |
| `Providers` | `id`, `name`, `merchantId`, `adapter`, `verificationStatus`, `isActive`, `createdAt`, `updatedAt` |
| `Promotion_Packages` | `id`, `providerId`, `merchantId`, `providerSku`, `title`, `description`, `currency`, `pricePaise`, `expectedReservations`, `expectedCpaPaise`, `discountBps`, `bookingDeadlineAt`, `validFrom`, `validUntil`, `verificationStatus`, `evidenceIds`, `createdAt`, `updatedAt` |
| `Campaign_Options` | `id`, `campaignId`, `packageId`, `evidenceIds`, `score`, `totalCostPaise`, `expectedReservations`, `expectedCpaPaise`, `discountBps`, `deterministicBudget`, `deterministicDeadline`, `deterministicPrice`, `deterministicMerchant`, `deterministicDiscount`, `deterministicCpa`, `passesDeterministicChecks`, `rejectionReasons`, `generatedSummary`, `createdAt` |
| `Campaign_Assets` | `id`, `campaignId`, `optionId`, `type`, `content`, `generatedBy`, `model`, `requiresOwnerApproval`, `createdAt` |
| `Transactions` | `id`, `campaignId`, `ownerApprovalId`, `providerId`, `packageId`, `status`, `currency`, `amountPaise`, `idempotencyKey`, `pravaAuthorizationId`, `checkoutAttemptedAt`, `merchantOrderId`, `createdAt`, `updatedAt` |
| `Merchant_Orders` | `id`, `transactionId`, `providerId`, `externalMerchantOrderId`, `status`, `currency`, `amountPaise`, `scheduledStartAt`, `scheduledEndAt`, `paidAt`, `createdAt`, `updatedAt` |
| `Reservations` | `id`, `campaignId`, `activationId`, `spotId`, `source`, `customerReference`, `seatCount`, `reservationAt`, `attributedAt`, `status`, `isTest`, `testLabel` |
| `Audit_Log` | `id`, `entityType`, `entityId`, `eventType`, `actorType`, `actorId`, `occurredAt`, `idempotencyKey`, `previousState`, `nextState`, `metadata` |

`pravaAuthorizationId` remains a compatibility column and must stay blank. The gateway deliberately excludes it from transaction writes.

## Credential Setup

1. Create a Google Sheets OAuth2 or service-account credential inside the local n8n instance.
2. Grant that Google identity access to `Reverb_Fill_Operations`.
3. Set `REVERB_FILL_SHEET_ID` in `n8n/.env`.
4. Import the workflow.
5. Assign the Google Sheets credential manually to every Google Sheets node. Credential references are intentionally absent from the JSON file.
6. Confirm every node resolves its named tab before activation.

Never place Google keys, OAuth refresh data, or service-account JSON in the repository.

## Node Flow

1. **Storage Webhook** receives the internal request.
2. **Normalize Signed Request** requires signature and timestamp headers and rejects requests older than five minutes.
3. **Calculate Expected Signature** computes the HMAC from `<timestamp>.<JSON body>` using the environment secret.
4. **Authorize And Validate** verifies the signature, validates `request_id`, allowlists operation fields, and converts nested values to JSON strings for Sheets.
5. **Route Storage Operation** selects one of the 17 supported branches.
6. **Google Sheets operation nodes** use named tabs and ID-column filters or matches. No node uses a sheet row number.
7. **Format Storage Response** returns a single object for single-record operations and an array for list operations.
8. **Return Storage Response** returns the JSON envelope.

## Supported Operations

The Switch output is zero-based. Its output order is part of the workflow contract so each operation remains connected to the intended Google Sheets node.

| Output | Operation | Sheet tab | Behavior |
| ---: | --- | --- | --- |
| 0 | `create_campaign` | `Campaigns` | Append validated campaign |
| 1 | `get_campaign` | `Campaigns` | Lookup by `id` |
| 2 | `update_campaign` | `Campaigns` | Update using matching `id` |
| 3 | `list_providers` | `Providers` | Read all providers |
| 4 | `list_packages` | `Promotion_Packages` | Read all packages |
| 5 | `save_campaign_options` | `Campaign_Options` | Append or update each option by `id` |
| 6 | `get_campaign_options` | `Campaign_Options` | Lookup by `campaignId` |
| 7 | `save_campaign_asset` | `Campaign_Assets` | Append or update by `id` |
| 8 | `get_campaign_asset` | `Campaign_Assets` | Lookup first match by `campaignId` |
| 9 | `save_transaction` | `Transactions` | Append or update by `id`, excluding authorization material |
| 10 | `get_transaction` | `Transactions` | Lookup first match by `campaignId` |
| 11 | `save_merchant_order` | `Merchant_Orders` | Append or update by `id` |
| 12 | `get_merchant_order` | `Merchant_Orders` | Lookup by `id` |
| 13 | `save_reservation` | `Reservations` | Append or update by `id` |
| 14 | `list_reservations` | `Reservations` | Lookup by `campaignId` |
| 15 | `append_audit_event` | `Audit_Log` | Append one immutable event |
| 16 | `list_audit_events` | `Audit_Log` | Lookup by campaign `entityId` |

An unmatched operation uses the separate fallback output and does not enter a Google Sheets branch.

## Request Contract

The caller serializes the JSON body, creates a Unix-seconds timestamp, and calculates lowercase hex HMAC-SHA256 over `<timestamp>.<serialized body>`.

Every request uses this shape. `data` contains the validated row or lookup fields required by the selected operation.

```json
{
  "operation": "<supported_operation>",
  "request_id": "<stable-idempotency-id>",
  "data": {}
}
```

Headers:

```text
Content-Type: application/json
X-Reverb-Timestamp: <unix-seconds>
X-Reverb-Signature: sha256=<hex-digest>
```

Create campaign example body:

```json
{
  "operation": "create_campaign",
  "request_id": "campaign:create:campaign_demo_001",
  "data": {
    "id": "campaign_demo_001",
    "spotId": "spot_quiet_cup_cafe",
    "requestedByOwnerId": "owner_diya_demo",
    "status": "DRAFT",
    "requestSummary": "Fill Friday evening capacity",
    "slotStartAt": "2026-08-07T13:30:00.000Z",
    "slotEndAt": "2026-08-07T15:30:00.000Z",
    "unusedCapacity": 12,
    "targetReservations": 6,
    "maxBudgetPaise": 500000,
    "maxDiscountBps": 1500,
    "maxExpectedCpaPaise": 85000,
    "createdAt": "2026-08-01T00:00:00.000Z",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
}
```

Lookup example body:

```json
{
  "operation": "get_campaign",
  "request_id": "campaign:get:campaign_demo_001",
  "data": {
    "id": "campaign_demo_001"
  }
}
```

Success responses use this shape:

```json
{
  "ok": true,
  "operation": "get_campaign",
  "request_id": "campaign:get:campaign_demo_001",
  "data": {}
}
```

`data` is an object or `null` for single-record operations and an array for list operations. The response preserves the incoming `operation` and `request_id`.

## Error Behaviour

- Missing or stale signature information is rejected before any Sheets node runs.
- Unsupported operations, missing IDs, and missing required fields fail before a write.
- Google authentication, missing-tab, or API errors fail the execution and produce a non-success webhook response.
- Callers must treat unknown or timed-out writes as indeterminate and reconcile by ID before retrying.
- Request IDs and record IDs must remain stable across safe retries.
- No failure is converted into a successful payment, order, or audit result.

## Local Fixture Fallback

Use the contract in `FIXTURE_STORAGE_FALLBACK.md` when Google Sheets is not connected. The fallback is a development-only endpoint specification and is not a second source of truth.
