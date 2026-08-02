# Technical State Workflows

All workflows import inactive and use n8n Data Tables for technical state. Configure the table IDs in `n8n/.env` before manual tests. Do not assign payment or messaging credentials to these workflows.

## 01 - Check Processed Event

File: `n8n/workflows/01-check-processed-event.json`

1. **Receive Event** exposes `POST /webhook/reverb/check-processed-event` and waits for the response node.
2. **Validate Event** requires `event_id`, `event_type`, and `source`; it also prepares an ISO timestamp and serializes the optional result.
3. **Find Processed Event** queries `processed_events` by the external `event_id` rather than a row number.
4. **Already Processed?** branches on whether a matching event exists.
5. **Format Duplicate** returns `is_duplicate: true` and performs no write.
6. **Record Processed Event** inserts a new row only for an unseen external event ID.
7. **Format New Event** returns `is_duplicate: false` after insertion.
8. **Return Result** returns a consistent JSON response.

Input example:

```json
{
  "event_id": "linq_event_001",
  "event_type": "message.received",
  "source": "linq",
  "result_json": {}
}
```

## 02 - Create Audit Event

File: `n8n/workflows/02-create-audit-event.json`

1. **Receive Audit Event** exposes `POST /webhook/reverb/create-audit-event`.
2. **Validate And Prepare** requires `campaign_id`, `event_type`, and `description`, then creates a storage-gateway request with a request ID.
3. **Sign Storage Request** calculates an HMAC-SHA256 signature with `N8N_INTERNAL_SECRET`. The secret is read from the environment and is not embedded in the workflow.
4. **Store Audit Event** sends the signed body to `N8N_STORAGE_WEBHOOK_URL`.
5. **Format Stored Event** rejects a failed storage response and returns the stored audit event.
6. **Return Audit Event** sends the JSON result to the caller.

Metadata must contain commercial context only. Never include payment authorization material, message contents, or integration secrets.

## 03 - Conversation State

File: `n8n/workflows/03-conversation-state.json`

1. **Receive State Operation** exposes `POST /webhook/reverb/conversation-state`.
2. **Validate Intake State** accepts `get`, `create`, or `update`. It allowlists only campaign-intake fields and serializes them into the two JSON columns.
3. **Route State Operation** selects the requested operation.
4. **Get Conversation State** queries `conversation_state` by `conversation_id`.
5. **Create Conversation State** inserts a new conversation row.
6. **Update Conversation State** updates the row found by `conversation_id`, never by row number.
7. **Format State Result** returns the operation, conversation ID, and stored data.
8. **Return State Result** sends the JSON response.

Allowed collected fields are:

- `unusedCapacity`
- `targetReservations`
- `maximumBudgetPaise`
- `maximumDiscountPercent`
- `maximumExpectedCpaPaise`
- `startTime`
- `endTime`
- `missingFields`

No payment, checkout, or merchant credential field is copied into conversation state.

## 04 - Payment Lock

File: `n8n/workflows/04-payment-lock.json`

1. **Receive Lock Operation** exposes `POST /webhook/reverb/payment-lock`.
2. **Validate Lock Input** accepts `acquire`, `mark_completed`, and `mark_failed`. Acquire requires a campaign and Prava session ID; completion also requires a merchant order ID.
3. **Route Lock Operation** routes the lifecycle operation.
4. **Find Existing Lock** queries `payment_locks` by `campaign_id`.
5. **Checkout Already Attempted?** blocks every later acquire once `checkout_attempted` is true.
6. **Format Blocked Lock** returns a safe blocked result without changing the row.
7. **Acquire Payment Lock** inserts the irreversible `CHECKOUT_ATTEMPTED` row before a provider call begins.
8. **Complete Payment Lock** retains `checkout_attempted: true` and stores only the merchant order reconciliation ID.
9. **Fail Payment Lock** retains `checkout_attempted: true` with `FAILED`; the failed row is never deleted or reset.
10. **Format Lock Result** returns the current safe lock state.
11. **Return Lock Result** returns the JSON response.

The lock stores a Prava session identifier for reconciliation, not a one-time checkout credential. Never add payment authorization values to the table or workflow execution data.

## Activation Checklist

1. Create the three Data Tables using `LOCAL_SETUP.md`.
2. Add their IDs to local environment configuration.
3. Import all four JSON files and confirm the Data Table nodes resolve correctly.
4. Run each workflow manually with fixture inputs.
5. Keep workflows inactive until the storage gateway and calling application are configured.
