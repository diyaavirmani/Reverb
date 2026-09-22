# Reverb

**Turn quiet capacity into measurable revenue.**

Reverb is a fixture-first campaign product for cafes and restaurants with underbooked time slots. It authenticates an owner, stores a compact venue profile in Clerk, analyzes safe public first-party website metadata, prepares a venue intelligence brief, and turns owner-approved quiet capacity into a measurable campaign.

Fixture/demo commerce is simulated. No real money moves in fixture mode.

## Product Flow

Underbooked capacity is expiring inventory. A table, seat, or booking slot loses commercial value when the time passes. Reverb helps a local venue owner recover that value by buying verified local distribution under deterministic constraints.

The current product flow exposed in the UI is:

```text
Landing
-> Clerk authentication
-> Venue onboarding
-> Venue Intelligence Brief
-> Personalized Dashboard
-> Create Campaign
-> Verified Discovery and Agent Activity
-> Creative Review
-> Owner Approval / Demo Transaction
-> Campaign Active
-> Reservations
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

`POST /api/reservations` is intentionally public because it represents a customer booking callback. It uses strict Zod parsing, an 8 KB request-body limit, and an in-memory per-IP rate limit; other campaign, venue, Reach, and Prava APIs require Clerk-backed Reverb permissions.

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

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- A Clerk application for authentication

Install dependencies:

```bash
npm install
```

Create local environment file:

```bash
cp .env.example .env.local
```

Minimum fixture values for local UI:

```env
USE_FIXTURES=true
APP_ENV=development
APP_URL=http://localhost:3000
DEMO_SPOT_ID=spot_quiet_cup_cafe
DEMO_TIMEZONE=Asia/Kolkata
```

Authentication also requires Clerk values in `.env` or `.env.local`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app-entry
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app-entry
```

Keep Clerk secret values in local or deployment environment configuration. Do not commit `.env.local`.

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Deploying the Showcase

The repository includes a Render blueprint in `render.yaml`. Reverb's fixture
store is copied once per Node process and kept in process-local storage, so the
showcase requires a persistent single Node host such as Render. Serverless hosts
such as Vercel are not supported for fixture deployment because separate
invocations would not share campaign, reservation, or performance state.

Create a Render Web Service from this repository and either apply the blueprint
or use the same commands:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /api/health
```

Render must use the Node runtime. Do not create this service as Python. Configure
the two Clerk keys as Render secrets; never place their values in the repository.
On Render's free plan, state can reset when the service restarts or sleeps.

Use a Clerk **production** instance for deployment. Add the Render domain to the
Clerk application and configure allowed redirect URLs for `/sign-in`,
`/sign-up`, and `/app-entry`. The session-token claim `metadata.role` controls
Reverb roles; when it is missing, Reverb defaults the user to `OWNER`.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk production publishable key, stored as a Render secret. |
| `CLERK_SECRET_KEY` | Yes | Clerk production secret key, stored as a Render secret. |
| `USE_FIXTURES` | Yes | Must be `true` for this deployment target. |
| `APP_ENV` | Yes | Use `production` on Render. |
| `APP_URL` | Yes | Public Render URL. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Recommended | `/sign-in`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Recommended | `/sign-up`. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Recommended | `/app-entry`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Recommended | `/app-entry`. |
| `DEMO_SPOT_ID` | Recommended | `spot_quiet_cup_cafe`. |
| `DEMO_TIMEZONE` | Recommended | `Asia/Kolkata`. |
| `REVERB_FIXTURE_DATA_DIR` | Optional | Test/ops override for the shared fixture store. Usually blank on Render. |
| `REACH_FIXTURE_DATA_DIR` | Optional | Backward-compatible fixture store override. Usually blank on Render. |
| `REVERB_CURRENT_TIME` | Optional | Test/ops clock override. Leave blank for real time. |

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
- `GET /api/venue/profile`
- `PUT /api/venue/profile`
- `POST /api/venue/analyze`
- `POST /api/venue/brief/approve`
- `GET /api/health`

The backend still includes additional typed routes for AI, provider verification, approval, Reach Exchange, and messaging adapters, but the frontend showcase does not require live external services.

## Test Commands

```bash
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

## Real vs Demo

- Fixture transactions are deterministic demo transactions, not real payments.
- A production payment provider can be added behind the existing adapter boundary later.
- Reach Exchange is a hackathon-built sandbox merchant.
- One provider should later be backed by real evidence or a provider interview.
- The current showcase is single-Spot and single-demo-campaign oriented.
- Clerk authentication, owner identity, venue profile, website metadata analysis, lifecycle orchestration, policy evaluation, approval state, and API communication are real.
- Provider marketplace records, fixture transaction, demo reservation outcomes, and trend context are deterministic fixture/demo data.
- Social channels are preferences only. A channel is never presented as connected or published without a configured publisher.

## Deployment Notes

Deploy the fixture showcase to Render or another persistent Node host. Do not deploy it to serverless infrastructure for production demos because fixture campaign state is process-local and intentionally resets on process restart. Venue profiles are stored in the authenticated Clerk user's private metadata with an 8 KB Clerk metadata cap and a conservative Reverb save margin.

## Pre-Existing Work

Generic campaign-generation and Google automation patterns existed before the hackathon. Reverb's product flow, deterministic commerce guardrails, provider scoring, fixture Reach Exchange sandbox, reservation attribution, and demo reporting are new hackathon work.

See `docs/PRE_EXISTING_WORK.md`.
