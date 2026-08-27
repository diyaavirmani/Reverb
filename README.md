# Reverb Fill

**Fill quiet slots at local spots.**

Reverb Fill is a fixture-first agentic-commerce showcase for cafes and restaurants with underbooked time slots. It creates a campaign, recommends a verified promotion package, previews the creative, simulates owner approval and commerce, records a labelled demo reservation, and reports recovered capacity.

Fixture/demo commerce is simulated. No real money moves in fixture mode.

## Product Concept

Underbooked capacity is expiring inventory. A table, seat, or booking slot loses commercial value when the time passes. Reverb Fill helps a local Spot owner recover that value by buying verified local distribution under deterministic constraints.

The product flow exposed in the UI is:

```text
Create Campaign
-> Recommended Promotion
-> Campaign Preview
-> Approval / Demo Transaction
-> Campaign Active
-> Reservation
-> Performance
```

## Fixture-First Showcase Architecture

The deployed showcase is designed to work without paid provider keys.

- **Next.js App Router** serves the UI and simplified fixture APIs.
- **Zod schemas** validate domain records and fixture data.
- **Local JSON fixtures** provide Spots, providers, packages, campaigns, transactions, reservations, and audit events.
- **Campaign service** coordinates deterministic policy checks, scoring, creative fixtures, demo approval, Reach Exchange sandbox checkout, activation, reservations, and performance.
- **n8n** is optional for orchestration demonstrations, not required for the deployed UI.

The UI talks directly to the simplified Next.js API. It does not require n8n to be running.

## Optional Integrations

These are optional in fixture mode and should not block the showcase:

- OpenAI live API
- Senso live API
- Prava live API
- Linq
- Gmail
- Google Drive
- Google Sheets
- n8n
- Tableau

When live mode is enabled later, the existing adapter boundaries and environment validation still fail clearly if required integration configuration is absent.

## Deterministic Provider Scoring

Provider eligibility and financial checks are deterministic. OpenAI may generate and explain, but it never approves spend.

Checks include:

- provider availability
- budget
- recurring billing
- deadline
- expected bookings
- worst-case CPA
- provider verification
- evidence confidence
- audience geography
- merchant, package, and price consistency

Eligible providers are scored with:

- 30% geographic relevance
- 25% expected booking potential
- 20% evidence confidence
- 15% cost efficiency
- 10% timing and availability

## Demo Scenario

The fixture story uses Quiet Cup Cafe:

- 12 unused seats
- Friday 7-9 PM
- target of 6 reservations
- maximum budget: 500000 paise
- maximum discount: 15%
- maximum expected CPA: 85000 paise

The recommended package is **Reach Exchange Local Dining Boost / Local Dining Boost** at 480000 paise with a worst-case expected CPA of 80000 paise.

Two alternatives are visible and rejected:

- weak local audience evidence
- budget and CPA violation

## Campaign Approval Simulation

The approval screen uses a fixture transaction and labels it as a **Demo transaction**. It does not collect card data, payment credentials, CVV, PAN, or tokens. A campaign is not shown as successfully purchased unless a fixture merchant order exists.

Reverb Reach Exchange is a hackathon-built sandbox merchant for quotes, checkout, delivery, and activation.

## Guardrails

- Money is stored as integer paise.
- Owner approval is required before checkout.
- OpenAI cannot approve spending.
- Merchant, package, amount, price, discount, deadline, and CPA checks are deterministic.
- Payment credentials are never stored.
- A checkout attempt cannot be reused after provider checkout begins.
- Payment and merchant operations are idempotent.
- Every commercial state change creates an audit event.
- Fixture tests never call real external APIs.
- Demo reservations remain visibly labelled.

## Local Setup

Install dependencies:

```powershell
npm install
```

Create local environment file:

```powershell
Copy-Item .env.example .env
```

Minimum fixture values for local UI:

```env
USE_FIXTURES=true
APP_ENV=development
APP_URL=http://localhost:3000
DEMO_SPOT_ID=spot_quiet_cup_cafe
DEMO_TIMEZONE=Asia/Kolkata
```

Start the app:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Deploying the Showcase

Minimum deployment variables for the fixture showcase:

```env
USE_FIXTURES=true
APP_ENV=production
```

Recommended non-secret additions:

```env
APP_URL=https://your-deployment.example
DEMO_SPOT_ID=spot_quiet_cup_cafe
DEMO_TIMEZONE=Asia/Kolkata
```

Paid provider keys are not mandatory for fixture deployment. Leave optional integration keys blank unless testing live integrations.

## n8n Automation

n8n is now optional for the deployed UI. Simplified importable workflows live in:

```text
n8n/workflows
```

Legacy exports are preserved in:

```text
n8n/workflows-legacy
```

Current simplified workflows:

- `10-campaign-orchestrator.json`
- `13-commerce.json`
- `15-reservation-performance.json`
- `16-campaign-reporting.json`

Validate workflow exports:

```powershell
npm run validate:n8n
```

## API Routes Used by the Showcase

- `POST /api/demo/lifecycle`
- `POST /api/demo/campaign`
- `POST /api/demo/commerce`
- `POST /api/demo/reservation`
- `POST /api/demo/report`
- `POST /api/reservations`
- `GET /api/campaigns/{campaignId}/performance`
- `GET /api/health`

The backend still includes additional typed routes for AI, provider verification, approval, Reach Exchange, and messaging adapters, but the frontend showcase does not require live external services.

## Test Commands

```powershell
npm run typecheck
npm run lint
npm run validate:fixtures
npm run test
npm run build
npm run eval:component
npm run eval:application
```

Workflow evals are useful when n8n is imported and running, but they are not a deployment blocker for the fixture-first UI.

## Tableau

Generate anonymized CSV datasets:

```powershell
npm run tableau:build
```

Outputs are written under:

```text
tableau/
```

## Limitations

- Fixture transactions are not real Prava transactions.
- Final judging with real payments must use a real Prava sandbox flow.
- Reach Exchange is a hackathon-built sandbox merchant.
- One provider should later be backed by real evidence or a provider interview.
- The current showcase is single-Spot and single-demo-campaign oriented.
- Authentication and production persistence are intentionally excluded.

## Pre-Existing Work

Generic campaign-generation and Google automation patterns existed before the hackathon. Reverb Fill's product flow, deterministic commerce guardrails, provider scoring, fixture Reach Exchange sandbox, reservation attribution, and demo reporting are new hackathon work.

See `docs/PRE_EXISTING_WORK.md`.
