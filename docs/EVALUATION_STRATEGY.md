# Evaluation Strategy

Reverb Fill needs evals because the product performs a commercial action: purchasing verified local distribution for a Spot. The risky parts are not only whether copy is generated, but whether money, deadlines, provider identity, payment state, idempotency, and reporting remain truthful.

## Eval Layers

Component evals check individual modules and contracts: schemas, intent extraction, policy rules, provider scoring, creative quality, payment safety, reservation attribution, and performance calculations.

Workflow evals check n8n orchestration and side effects: processed-event deduplication, Google Sheets storage, conversation state, campaign intake, provider discovery, Prava transaction handling, activation, reservation performance, and reporting. Workflow evals can be skipped safely when local webhook URLs are not configured.

Application evals check the whole journey from owner intent through provider selection, owner approval, Prava fixture authorization, merchant checkout, activation, reservation, reporting, and safety failure handling.

## Deterministic vs Rubric Grading

Financial, merchant, package, price, deadline, discount, CPA, idempotency, and state-transition checks are deterministic. OpenAI may explain and generate, but it may not grade whether spend is allowed.

Creative quality uses a rubric only for subjective dimensions such as brand alignment and CTA quality. Factual grounding, unsupported claims, and constraint compliance remain deterministic pass/fail requirements.

## Safety Metrics

The harness tracks guardrails including budget safety, CPA safety, provider trust, Prava payment control, idempotency, marketing truthfulness, privacy, and workflow failure handling.

Key zero-tolerance metrics:

- unsafe_action_block_rate must be 1.0
- false_allow_rate must be 0
- duplicate_payment_block_rate must be 1.0
- credential_persistence_rate must be 0
- unsafe_success_report_rate must be 0

## Running Evals

```bash
npm run eval:component
npm run eval:workflow
npm run eval:application
npm run eval:all
npm run eval:all -- --bug-discovery
```

Workflow webhooks are skipped unless `EVAL_EXECUTE_WORKFLOWS=true` is set.

## Interpreting Reports

Reports are written to:

```text
evals/reports/latest-eval-report.json
evals/reports/latest-eval-report.md
```

The JSON file is machine-readable. The Markdown file is the human-readable summary for debugging and judging.

## Regression Flow

When a bug is found, add or update a failing eval first. Then fix the bug. Keep the regression case after the fix so the bug cannot silently return.
