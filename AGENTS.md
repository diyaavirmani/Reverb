# AGENTS.md

## Project Context

Reverb Fill is an agentic-commerce product that helps cafes and restaurants fill underbooked time slots.

Internally, use the generic entity name `Spot` so the system can later support salons, studios, and other bookable businesses.

## Fixed Workflow

owner request
-> campaign constraints
-> promotion package discovery
-> Senso evidence verification
-> deterministic filtering and scoring
-> campaign generation
-> quality validation
-> owner approval
-> Prava authorisation
-> provider checkout
-> promotion activation
-> tracked reservation
-> reporting

## Mandatory Engineering Rules

1. Work on only the requested task.
2. Do not refactor unrelated files.
3. Never hardcode or commit secrets.
4. Use environment variables for all integrations.
5. Support fixture mode and live mode.
6. Fixture mode must be enabled by `USE_FIXTURES=true`.
7. Store all monetary values as integer paise.
8. OpenAI may explain and generate, but may not approve spending.
9. Budget, deadline, price, merchant, discount, and CPA checks must be deterministic.
10. Never report a successful purchase before a merchant order exists.
11. Never store card data, CVV, payment tokens, or payment credentials.
12. Never reuse a Prava credential after a checkout attempt.
13. Every commercial state change must create an audit event.
14. Every payment and merchant operation must be idempotent.
15. Tests must not make real external API calls.
16. Run tests and type checking after every task.
17. Stop after completing the requested task and summarise changed files.
18. Do not build final visual styling until explicitly requested.
