# Reverb Fill

**Fill quiet slots at local spots.**

Reverb Fill is an agentic-commerce product that helps cafes and restaurants recover revenue from underbooked time slots by purchasing verified local distribution within owner-approved constraints.

Internally, every bookable business is a `Spot`, allowing the same system to later support salons, studios, clinics, and other appointment-based businesses.

## Problem

Underbooked capacity is expiring inventory. An empty table or unused seat has no recoverable commercial value after its time slot passes. Owners can create promotion content quickly, but finding a relevant audience, validating the provider, controlling spend, and safely completing checkout remain fragmented and manual.

## One-Line Pitch

Reverb Fill turns a quiet future slot into an owner-approved, verified promotion purchase with tracked reservations and auditable results.

## End-to-End Flow

```text
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
```

OpenAI generates and explains; it never approves spending. Budget, deadline, price, merchant, discount, and CPA decisions are deterministic.

## Architecture

- **Next.js App Router** exposes typed API routes and coordinates application services.
- **Zod** validates domain, request, response, fixture, and integration boundaries.
- **n8n** orchestrates intake, discovery, creative review, payment, activation, reservations, and reporting.
- **Google Sheets** holds business-readable operational records.
- **n8n Data Tables** hold processed-event, payment-lock, and conversation technical state.
- **Google Drive** stores sanitized campaign artifacts and reports.
- **Linq** carries owner messages without forcing iMessage, RCS, or SMS.
- **OpenAI** extracts intent, explains deterministic decisions, generates creative, and reviews quality.
- **Senso** supplies provider evidence used by deterministic policy checks.
- **Prava** authorises one checkout attempt after owner approval.
- **Reverb Reach Exchange** is the hackathon-built sandbox merchant used for provider quotes, checkout, delivery, and activation.
- **Tableau** consumes anonymized CSV datasets for performance and trust reporting.

## Directory Structure

```text
src/app/api/          Next.js API routes
src/lib/core/         Policy, scoring, state, commerce, reservation, and campaign services
src/lib/adapters/     Fixture/live integration boundaries
src/lib/repositories/ Repository interfaces and atomic fixture implementation
src/lib/security/     Idempotency, signatures, redaction, and event deduplication
src/schemas/          Strict Zod schemas and inferred TypeScript types
fixtures/data/        Business-record fixture store
fixtures/*/           Integration fixtures
fixtures/sheets/      Google Sheets tab templates
n8n/workflows/        Importable inactive n8n workflows
n8n/docs/             n8n and Google setup documentation
tableau/              Generated datasets and dashboard build guide
scripts/              Validation, demo, n8n, and dataset tools
tests/                Unit, route, integration, safety, and end-to-end tests
docs/                 Product, architecture, safety, demo, and disclosure documents
```

## Fixture Mode Setup

Fixture mode is the default development path and makes no real external API calls.

```powershell
Copy-Item .env.example .env
```

Set these local values:

```text
USE_FIXTURES=true
APP_URL=http://localhost:3000
APP_ENV=development
DEMO_SPOT_ID=spot_quiet_cup_cafe
DEMO_TIMEZONE=Asia/Kolkata
```

Generate local secrets for `APP_SECRET` and `N8N_INTERNAL_SECRET`; never commit `.env`. Integration keys may remain blank in fixture mode.

**Fixture transactions are simulations and are not real Prava transactions. Final judging must use a real Prava sandbox flow.**

## Local Next.js Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run demo:seed
npm run dev
```

Open `http://localhost:3000`. The minimal page reports that the Reverb Fill API is running.

Production checks:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

## Local n8n Setup

Requirements: Docker Desktop and Docker Compose v2.

```powershell
Copy-Item n8n/.env.example n8n/.env
docker compose --env-file n8n/.env up -d n8n
```

Open `http://localhost:5678`, create the local n8n owner, create the Data Tables documented in [LOCAL_SETUP.md](n8n/docs/LOCAL_SETUP.md), and keep credentials local.

Stop n8n with:

```powershell
docker compose --env-file n8n/.env down
```

## Environment Variables

The canonical blank contract is [.env.example](.env.example).

| Group | Variables |
| --- | --- |
| Runtime | `USE_FIXTURES`, `APP_URL`, `APP_ENV`, `APP_SECRET`, `N8N_INTERNAL_SECRET` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL` |
| Senso | `SENSO_API_KEY`, `SENSO_API_BASE`, `SENSO_PROVIDER_FOLDER_ID` |
| Linq | `LINQ_API_KEY`, `LINQ_API_BASE`, `LINQ_FROM_NUMBER`, `LINQ_WEBHOOK_URL`, `LINQ_WEBHOOK_SECRET` |
| Prava | `NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY`, `PRAVA_SECRET_KEY`, `PRAVA_API_BASE`, `PRAVA_INTEGRATION_TYPE`, `PRAVA_CURRENCY` |
| n8n | `N8N_BASE_URL`, `N8N_INTAKE_WEBHOOK_URL`, `N8N_STORAGE_WEBHOOK_URL`, `N8N_CAMPAIGN_WEBHOOK_URL`, `N8N_REPORT_WEBHOOK_URL` |
| Demo | `DEMO_SPOT_ID`, `DEMO_OWNER_EMAIL`, `DEMO_TIMEZONE` |

Live mode uses `USE_FIXTURES=false` and fails clearly when an integration's required configuration is absent. Never put real values in `.env.example`.

## Workflow Import

1. Run `npm run validate:n8n`.
2. Import JSON files from `n8n/workflows` in numeric order.
3. Configure workflows `01` through `05` first.
4. Assign Data Table and Google credentials manually in n8n.
5. Configure webhook URL environment variables.
6. Test with fixtures while every workflow remains inactive.
7. Activate only after signature, storage, and error branches are verified.

See [BUSINESS_WORKFLOWS.md](n8n/docs/BUSINESS_WORKFLOWS.md), [LOCAL_SETUP.md](n8n/docs/LOCAL_SETUP.md), and [GOOGLE_SETUP.md](n8n/docs/GOOGLE_SETUP.md).

## Test Commands

```sh
npm run validate:fixtures
npm run validate:n8n
npm run typecheck
npm run lint
npm run test
npm run build
```

Tests use temporary fixture copies and never call real external APIs.

## Demo Data

The demo uses Quiet Cup Cafe, 12 unused seats, Friday 7-9 PM, a target of 6 reservations, a maximum budget of 500000 paise, a 15% maximum discount, and a maximum expected CPA of 85000 paise.

```sh
npm run demo:reset
npm run demo:seed
npm run demo:verify
```

The three packages intentionally produce one winner, one evidence/geography rejection, and one budget/deadline/CPA rejection. The Reach Exchange fixture also includes a controlled live price change from 300000 to 550000 paise.

Any demo reservation must use `isDemoBooking=true` and retain the label `TEST RESERVATION - NOT A REAL CUSTOMER`.

## Security Rules

- Store money as integer paise.
- Require explicit owner approval before Prava authorisation.
- Never let OpenAI approve spending or determine payment success.
- Re-run deterministic price, merchant, package, deadline, budget, discount, and CPA checks before checkout.
- Consume the Prava credential before the provider call and never reuse it.
- Never persist card data, CVV, PAN, payment tokens, one-time credentials, or payment credentials.
- Never report purchase success before a merchant order exists.
- Make payment and merchant operations idempotent.
- Reconcile merchant state after timeout or ambiguous failure.
- Create an audit event for every commercial state change.
- Redact sensitive fields from logs, errors, shared reports, and n8n records.

See [PAYMENT_SAFETY.md](docs/PAYMENT_SAFETY.md).

## API Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/ai/intent` | Extract campaign intent |
| `POST` | `/api/ai/explain-decision` | Explain a deterministic provider decision |
| `POST` | `/api/ai/generate-campaign` | Generate selected-package creative |
| `POST` | `/api/ai/review-quality` | Review tone, clarity, grammar, and claims |
| `POST` | `/api/senso/verify-provider` | Verify provider evidence |
| `POST` | `/api/webhooks/linq` | Receive and normalize Linq events |
| `POST` | `/api/linq/send` | Send an owner message through Linq |
| `POST` | `/api/prava/session` | Create a Prava approval session |
| `GET` | `/api/prava/result` | Read a Prava result |
| `POST` | `/api/prava/report` | Report a safe merchant checkout outcome |
| `GET` | `/api/reach/packages` | List Reach Exchange packages |
| `GET` | `/api/reach/quote` | Fetch a live package quote |
| `POST` | `/api/reach/checkout` | Create one idempotent merchant order |
| `GET` | `/api/reach/orders/{orderId}` | Read merchant order state |
| `POST` | `/api/reach/orders/{orderId}/deliver` | Deliver approved creative and brief |
| `POST` | `/api/reach/orders/{orderId}/activate` | Activate a delivered promotion |
| `POST` | `/api/reservations` | Attribute a reservation |
| `GET` | `/api/campaigns/{campaignId}/performance` | Read campaign performance |

## n8n Workflows

| File | Responsibility |
| --- | --- |
| `01-check-processed-event.json` | External event deduplication |
| `02-create-audit-event.json` | Signed audit persistence |
| `03-conversation-state.json` | Campaign intake state |
| `04-payment-lock.json` | Irreversible checkout attempt lock |
| `05-storage-gateway.json` | Signed Google Sheets gateway |
| `10-campaign-intake.json` | Linq intake and missing-field question |
| `11-provider-discovery.json` | Senso verification, policy, scoring, selection |
| `12-creative-quality.json` | Creative generation and quality gates |
| `13-prava-transaction.json` | Approval, Prava, payment lock, checkout |
| `14-promotion-activation.json` | Creative delivery and activation |
| `15-reservation-performance.json` | Reservation attribution and progress |
| `16-campaign-reporting.json` | Sheets, Drive, Gmail, and report generation |

## Tableau Dataset

Generate anonymized data sources with:

```sh
npm run tableau:build
```

Outputs:

- `tableau/campaign_performance.csv`
- `tableau/provider_performance.csv`
- `tableau/payment_trust.csv`
- `tableau/conversion_funnel.csv`

Dashboard formulas and chart specifications are in [DASHBOARD_BUILD.md](tableau/DASHBOARD_BUILD.md).

## Limitations

- Fixture mode is the only fully automated local path.
- Fixture Prava responses do not prove live authorisation or settlement.
- Reverb Reach Exchange is a hackathon-built sandbox merchant, not an external production provider marketplace.
- Google credentials and n8n workflows require manual local configuration.
- The MVP supports one Spot and one campaign slot at a time.
- There is no authentication system, database, ORM, or final frontend design.
- Test reservations are excluded from real performance claims.
- One provider should later be backed by real evidence or a provider interview before production or final commercial claims.

## Roadmap

1. Complete and demonstrate a real Prava sandbox authorisation flow for final judging.
2. Replace at least one provider fixture with real Senso-backed evidence or a documented provider interview.
3. Connect live Linq delivery and deploy public signed webhooks.
4. Connect Google Sheets, Drive, and Gmail credentials in n8n.
5. Add owner authentication and durable production persistence.
6. Build the final booking and owner-review interfaces only after the integration flow is stable.
7. Expand `Spot` support to salons, studios, and other bookable businesses.

## Track Mapping

| Product surface | Contribution |
| --- | --- |
| Agentic commerce | Owner-approved purchase of verified local audience access |
| OpenAI | Intent extraction, deterministic-decision explanation, creative generation, quality review |
| Senso | Evidence verification for provider geography, history, price, and deadline |
| Prava | Authorisation boundary and checkout outcome reconciliation |
| Linq | Owner intake, approval links, status, and progress messaging |
| n8n | Auditable orchestration and technical state workflows |
| Google | Sheets business records, Drive artifacts, Gmail reports |
| Tableau | Capacity, campaign, provider-trust, and spending-control analytics |

## Pre-Existing Work Disclosure

Generic campaign-generation ideas and Google automation patterns existed before the hackathon. Reverb Fill's product definition, fixed commerce flow, deterministic safety gates, Senso/Prava integration model, Reach Exchange sandbox, attribution, audit model, and demo scenario are new hackathon work.

See [PRE_EXISTING_WORK.md](docs/PRE_EXISTING_WORK.md) for the complete boundary statement.
