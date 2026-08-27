# Backend Ready for n8n Testing

Verification date: 2026-08-05

## Readiness Status

**READY - the fixture-mode backend and repository-owned n8n workflows are ready for controlled Phase 3 testing.**

The verification was completed from `C:\Users\diyav\OneDrive\Documents\hack`. No live OpenAI, Senso, Linq, Prava, Google, Gmail, or n8n business operation was required by these checks.

## Command Results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed with no TypeScript errors |
| `npm run lint` | Passed with 0 errors and 8 existing warnings |
| `npm run validate:fixtures` | Passed: 28 JSON fixtures and 10 sheet templates |
| `npm run test` | Passed: 23 test files and 246 tests |
| `npm run build` | Passed: Next.js 16 production build completed |
| `npm run demo:verify` | Passed: fixtures, environment contract, 12 workflows, deterministic outcomes, secret scan, tests, and Tableau generation |

## Fixture Mode

- `USE_FIXTURES`: enabled
- Tests and demo verification do not make real external API calls.
- Fixture transactions are not real Prava transactions.
- Live Linq and live Prava testing remain out of scope for this phase.

## Environment Safety

- `.env` values were not printed, copied, or committed during verification.
- `.env` is ignored by git.
- `.env.example` contains placeholders only.
- The tracked-file secret scan passed.

The following n8n configuration variables are present and configured. Values are intentionally omitted:

- `N8N_BASE_URL`
- `N8N_INTAKE_WEBHOOK_URL`
- `N8N_STORAGE_WEBHOOK_URL`
- `N8N_CAMPAIGN_WEBHOOK_URL`
- `N8N_REPORT_WEBHOOK_URL`
- `N8N_INTERNAL_SECRET`

## Repository Workflows

The following workflow files are present and validated:

1. `01-check-processed-event.json`
2. `02-create-audit-event.json`
3. `03-conversation-state.json`
4. `04-payment-lock.json`
5. `05-storage-gateway.json`
6. `10-campaign-intake.json`
7. `11-provider-discovery.json`
8. `12-creative-quality.json`
9. `13-prava-transaction.json`
10. `14-promotion-activation.json`
11. `15-reservation-performance.json`
12. `16-campaign-reporting.json`

## Linq Scope

- `POST /api/webhooks/linq` is present.
- `POST /api/linq/send` is present.
- Linq normalization and webhook-signature helpers are present.
- Inbound and outbound Linq fixtures are present.
- Do not create the live Linq dashboard webhook until the public app URL and n8n intake flow have been tested.

## Next Test Order

Run the n8n workflows one at a time in this order:

1. `05-storage-gateway`
2. `10-campaign-intake`
3. `11-provider-discovery`
4. `12-creative-quality`
5. `13-prava-transaction` in fixture mode
6. `14-promotion-activation`
7. `15-reservation-performance`
8. `16-campaign-reporting`

Stop at the first failed workflow and record its safe HTTP status, response shape, affected sheet or record, and error message without exposing credentials or customer data.
