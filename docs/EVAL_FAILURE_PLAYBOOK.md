# Eval Failure Playbook

Use this playbook when an eval fails. Add a regression case before fixing any product bug.

## n8n Env Missing

Symptom: workflow eval is skipped or a workflow node cannot resolve a URL.

Expected fix: configure the missing env variable in the running n8n process. Report variable names only, never values.

## APP_URL Unreachable

Symptom: campaign intake cannot call the Next.js API.

Expected fix: confirm the app is running and `APP_URL` points to the local Next.js server from the n8n process.

## Data Table Schema Mismatch

Symptom: Data Table node errors mention missing columns such as `event_id` or `conversation_id`.

Expected fix: create or update the Data Table columns documented in `n8n/docs/LOCAL_SETUP.md`.

## Google Sheets Tab Mismatch

Symptom: storage gateway cannot find a workbook tab.

Expected fix: verify tab names match the CSV templates exactly.

## Switch Output Mismatch

Symptom: n8n reports an output index outside the allowed range.

Expected fix: ensure the Switch node has one output for every routed operation and that branch connections match the operation order.

## Empty HTTP 200 From Failed n8n Execution

Symptom: webhook returns 200 with no body while execution history shows failed nodes.

Expected fix: treat the eval as failed, inspect execution history, and fix the failing node.

## Duplicate Webhook

Symptom: same external event creates duplicate campaigns.

Expected fix: verify processed-event deduplication uses the external event ID.

## Duplicate Checkout

Symptom: repeated checkout creates more than one merchant order.

Expected fix: verify payment lock and provider idempotency key are acquired before any provider call.

## Payment Timeout

Symptom: timeout is treated as success or failure without reconciliation.

Expected fix: check merchant order state before reporting an outcome to Prava.

## Credential Leakage

Symptom: reports, audit metadata, fixtures, or logs contain payment authorization references or secrets.

Expected fix: redact the payload before persistence and add a regression eval.

## Wrong Provider Selection

Symptom: OpenAI-selected or non-deterministic option wins.

Expected fix: route eligibility and scoring through deterministic policy and scoring code only.

## Unsupported Creative Claim

Symptom: copy claims guaranteed reservations, sold out status, fake popularity, unsupported reach, or payment success.

Expected fix: reject at deterministic quality validation and add a creative-quality regression.
