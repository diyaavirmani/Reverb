# Fixture Storage Fallback Specification

## Purpose

Local n8n workflow testing may use a Next.js fixture endpoint while Google Sheets credentials are unavailable. The endpoint should delegate to `LocalFixtureRepository` so test data remains schema-validated and atomic.

This document specifies the endpoint contract only. No endpoint is created by this task.

## Endpoint

```text
POST /api/n8n/storage-fixture
```

Availability rules:

- `USE_FIXTURES` must equal `true`.
- The application environment must not be production.
- Production must return `404` or `403` without inspecting operation data.
- If `N8N_INTERNAL_SECRET` is configured, use the same timestamped HMAC headers as the live storage gateway.

## Request

Use the same envelope as `05-storage-gateway.json`:

```json
{
  "operation": "get_campaign",
  "request_id": "fixture:campaign:get:campaign_demo_001",
  "data": {
    "id": "campaign_demo_001"
  }
}
```

Supported operation names and field requirements must stay identical to the live storage gateway. Monetary values remain integer paise.

## Response

Success:

```json
{
  "ok": true,
  "operation": "get_campaign",
  "request_id": "fixture:campaign:get:campaign_demo_001",
  "data": null,
  "fixture": true
}
```

Validation failure:

```json
{
  "ok": false,
  "operation": "get_campaign",
  "request_id": "fixture:campaign:get:campaign_demo_001",
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Fixture storage request is invalid."
  },
  "fixture": true
}
```

Do not include raw Zod issues, filesystem paths, environment values, customer contact data, or integration details in the response.

## Safety And Idempotency

- Validate every input with the corresponding domain schema before writing.
- Use the repository's atomic temporary-write, full-validation, and rename behavior.
- Use `request_id` or the domain idempotency key for duplicate-write protection.
- Repeated identical requests return the original result.
- Reused request IDs with different payloads return `409 Conflict`.
- Never accept or persist card data, CVV, one-time payment authorization material, integration secrets, or provider checkout credentials.
- Never report a completed checkout without a stored merchant order.
- Tests must call only fixture adapters and local files.
