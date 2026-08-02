# Google Setup

Workflows `15-reservation-performance` and `16-campaign-reporting` use Google Sheets, Google Drive, and Gmail. All imported nodes intentionally have no assigned credentials.

## Prerequisites

1. Create the `Reverb_Fill_Operations` workbook from the CSV templates in `fixtures/sheets`.
2. Set `REVERB_FILL_SHEET_ID` in the local n8n environment. Use the workbook ID, not its URL.
3. Set `DEMO_OWNER_EMAIL` to the demo Spot owner's email for local execution. A live owner-directory lookup should replace this demo-only address later.
4. Import workflows `01` through `05`, then `15` and `16`.
5. Create one Google OAuth2 credential in n8n with access to Google Sheets, Google Drive, and Gmail.
6. Assign that credential manually to each Google Sheets, Google Drive, and Gmail node. Do not export the credential with a workflow.

## Campaign Metrics Columns

The `Campaigns` tab must include these reporting columns in addition to its domain columns:

- `confirmedReservationCount`
- `confirmedGuestCount`
- `capacityRecoveryPercent`
- `remainingCapacity`
- `promotionSpendPaise`
- `actualCostPerReservationPaise`
- `estimatedRevenueRecoveredPaise`
- `metricsUpdatedAt`

All money columns contain integer paise. `actualCostPerReservationPaise` remains blank until at least one non-demo reservation is confirmed.

## Drive Layout

Workflow `16` searches before creating each folder and uses this exact structure:

```text
Reverb Fill/
  Campaigns/
    {campaignId}/
      approved-creative.json
      campaign-brief.txt
      provider-comparison.html
      transaction-summary.json
      campaign-report.json
```

The provider comparison is PDF-ready HTML. PDF conversion can be added later without changing the report payload.

## Gmail

The Gmail node sends a concise HTML report to the configured Spot owner. The message includes aggregate campaign metrics only. It must never include customer names, contact details, tracking identifiers, or payment credentials.

The sample rendering is in `n8n/fixtures/16-campaign-report-email.html`.

## Triggering

Workflow `16` accepts signed internal events with one of these trigger values:

- `CAMPAIGN_ACTIVATION`
- `RESERVATION_UPDATE`
- `CAMPAIGN_COMPLETION`

The signature is HMAC-SHA256 over `<unix timestamp>.<raw JSON body>` using `N8N_INTERNAL_SECRET`. The timestamp must be within five minutes.

## Manual Verification

After credentials are assigned in a local n8n instance:

1. Run workflow `15` with `15-reservation-valid.json`.
2. Confirm the demo row contains `isTest=true` and a visible `TEST` label.
3. Confirm the matching `Campaigns` row receives metric values.
4. Run workflow `16` with the sample report trigger.
5. Confirm one campaign folder is located or created and exactly five artifacts are uploaded.
6. Inspect the artifacts and email to confirm no customer contact or payment data appears.

Never paste credential values into workflow JSON, node notes, fixture files, or documentation.
