# Payment Safety

## Financial Rules

1. Store all monetary values as integer paise.
2. Use environment variables for every live integration.
3. Support fixture mode and live mode.
4. Fixture mode must be enabled by `USE_FIXTURES=true`.
5. OpenAI may explain and generate, but may not approve spending.
6. Owner approval is required before Prava authorisation.
7. Prava authorisation is required before provider checkout.
8. Budget checks must be deterministic.
9. Deadline checks must be deterministic.
10. Price checks must be deterministic.
11. Merchant checks must be deterministic.
12. Discount checks must be deterministic.
13. CPA checks must be deterministic.
14. Never report a successful purchase before a merchant order exists.
15. Never store card data, CVV, payment tokens, or payment credentials.
16. Never reuse a Prava credential after a checkout attempt.
17. Tests must not make real external API calls.

## Idempotency Rules

1. Every payment operation must be idempotent.
2. Every merchant operation must be idempotent.
3. Every checkout attempt must use a stable idempotency key.
4. Retried provider calls must use the original idempotency key for the same operation.
5. A new commercial operation must receive a new idempotency key.
6. A timeout must not be treated as a failed purchase until the merchant order state is checked.
7. A timeout must not be treated as a successful purchase until a merchant order exists.
8. Every commercial state change must create an audit event.
9. Audit events must record the operation, state transition, actor or system component, timestamp, idempotency key, and external reference when available.
10. Duplicate callbacks must not create duplicate commercial state changes.
11. Duplicate callbacks may append audit observations, but must not mutate the state inconsistently.
12. Fixture tests must exercise idempotent retry behavior without making real external API calls.
