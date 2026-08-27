# Reverb Fill Evals

This directory contains the Reverb Fill evaluation harness.

The harness evaluates three layers:

- Component evals for schemas, adapters, deterministic policy, provider scoring, payment safety, creative quality, and reservation metrics.
- Workflow evals for n8n automation, storage, intake, discovery, Prava, activation, reservations, and reporting.
- Application evals for full happy paths, failure paths, adversarial prompts, and regressions.

## Commands

```bash
npm run eval:component
npm run eval:workflow
npm run eval:application
npm run eval:all
npm run eval:report
npm run guardrails:check
npm run eval:all -- --bug-discovery
```

## Fixture Safety

All evals require fixture mode. The harness refuses to run when `USE_FIXTURES=false`.

Workflow webhooks are not called by default. To execute local n8n workflow calls, set:

```bash
EVAL_EXECUTE_WORKFLOWS=true
```

When workflow URLs are absent, workflow evals are clearly marked as skipped. Reports are written to:

```text
evals/reports/latest-eval-report.json
evals/reports/latest-eval-report.md
```

Reports are redacted before writing and must not include API keys, bearer tokens, webhook secrets, payment authorization references, card data, CVV, or payment credentials.
