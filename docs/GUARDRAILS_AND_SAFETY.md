# Guardrails and Safety

This document defines the automated safety rules enforced by the eval harness.

## Budget Guardrail

The system must never spend more than `campaign.maximum_budget`.

Tests cover:

- package cost above budget
- approval amount above budget
- changed price after approval
- duplicate payment retry

## CPA Guardrail

Worst-case CPA must satisfy:

```text
package.price / expected_booking_min <= maximum_expected_cpa
```

If `expected_booking_min` is zero or unknown, the package is rejected unless a future workflow explicitly sends it to human review.

## Discount Guardrail

Generated campaign material must not exceed the owner-approved maximum discount.

## Provider Trust Guardrail

Providers are rejected unless evidence is verified. The MVP does not let OpenAI override Senso evidence or deterministic policy checks.

## Prava Payment Guardrail

The agent must not:

- spend without explicit owner approval
- mutate merchant after approval
- mutate package after approval
- mutate amount after approval
- reuse a payment credential
- store payment credentials
- report success before a merchant order exists
- retry checkout blindly after timeout

## Idempotency Guardrail

Duplicate events must not create duplicate:

- campaigns
- campaign options
- payment attempts
- merchant orders
- reservations
- reports

## Marketing Truthfulness Guardrail

Generated creative must not claim:

- sold out
- guaranteed bookings
- fake popularity
- fake reviews
- fake scarcity
- unsupported discounts
- unsupported provider reach

## Privacy Guardrail

Reports and logs must redact:

- phone numbers where not required
- bearer tokens
- webhook secrets
- Prava secrets
- OpenAI keys
- Senso keys
- Linq keys
- internal signing secrets
- payment authorization references

## Workflow Failure Guardrail

The app must not treat an empty HTTP 200 response from a failed n8n execution as success.

This eval result is always a failure:

```text
HTTP 200 + empty body + failed n8n execution = FAIL
```
