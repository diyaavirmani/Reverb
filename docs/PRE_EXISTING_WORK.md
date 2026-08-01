# Pre-Existing Work

## Work That Existed Before the Hackathon

The following categories are considered pre-existing work:

- Generic campaign-generation concepts, prompts, and examples not specific to Reverb Fill.
- General Google automation patterns, including Google Sheets, Google Drive, and n8n automation experiments.
- Reusable integration exploration for messaging, file storage, and reporting.
- Broad ideas about helping businesses generate marketing copy.
- General workflow automation knowledge that was not tied to the fixed Reverb Fill commercial workflow.

This pre-existing work did not define the Reverb Fill product boundary, payment-safety model, provider checkout flow, Senso verification step, Prava authorisation step, or deterministic commercial constraints.

## New Hackathon Work

The following work is new hackathon work:

- Product definition for Reverb Fill.
- The internal generic entity model using `Spot`.
- The fixed end-to-end workflow from owner request through reporting.
- The agentic-commerce framing: purchasing verified local distribution for underbooked local capacity.
- Deterministic budget, deadline, price, merchant, discount, and CPA checks.
- Senso evidence verification as a required gate before filtering and scoring.
- Prava authorisation as a required gate after owner approval and before checkout.
- Reach Exchange provider checkout as the purchase path for verified local distribution.
- The rule that purchase success must not be reported before a merchant order exists.
- The rule that Prava credentials must never be reused after a checkout attempt.
- Commercial audit events for every commercial state change.
- Idempotency requirements for every payment and merchant operation.
- Fixture-mode and live-mode separation using `USE_FIXTURES=true`.
- The demo scenario with 12 unused seats, Friday 7-9 PM, a 6-reservation target, ₹5,000 maximum budget, 15% maximum discount, ₹850 maximum expected CPA, three packages, one winner, rejections, one completed order, and one clearly labelled test reservation.

## Boundary Statement

Generic campaign generation and Google automation existed before the hackathon.

The Reverb Fill product, workflow, safety rules, commerce gates, verification path, checkout path, attribution scenario, and MVP documentation are new hackathon work.
