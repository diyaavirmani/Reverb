# Product

## Product

Reverb Fill

## Tagline

Fill quiet slots at local spots

## Initial User

The initial user is cafes and restaurants with underbooked time slots.

Internally, the bookable business entity is called `Spot` so the product can later support salons, studios, classes, clinics, and other appointment or reservation-based businesses.

## Problem

Underbooked capacity is expiring inventory. Empty tables, unused seats, quiet service windows, and unfilled booking slots lose commercial value once the time passes.

Reverb Fill helps a `Spot` owner convert a quiet future slot into demand by purchasing verified local distribution under deterministic business constraints.

## Commercial Action

The commercial action is purchasing verified local distribution.

Reverb Fill does not treat a campaign as successful because content was generated. A campaign becomes commercially active only after verified distribution is selected, the owner approves the spend, Prava authorises the checkout attempt, a provider checkout creates a merchant order, and the promotion is activated.

## Why AI Generates the Campaign but Purchases Audience Access

OpenAI is used to explain options, generate campaign copy, and help produce owner-facing recommendations. This is useful for speed, clarity, and campaign quality.

The scarce commercial resource is not the generated text. It is verified audience access: the ability to place a promotion in front of relevant local customers through a merchant or distribution provider. Reverb Fill therefore purchases audience access from verified providers instead of treating AI-generated content as the paid asset.

OpenAI may explain and generate, but it may not approve spending. Spending approval belongs to the owner, and checkout authorisation belongs to Prava.

## Exact End-to-End Workflow

1. owner request
2. campaign constraints
3. promotion package discovery
4. Senso evidence verification
5. deterministic filtering and scoring
6. campaign generation
7. quality validation
8. owner approval
9. Prava authorisation
10. provider checkout
11. promotion activation
12. tracked reservation
13. reporting

## MVP Boundaries

The MVP supports one owner request for one `Spot`, one underbooked time slot, a small set of discovered promotion packages, deterministic filtering against owner constraints, AI-generated campaign material, owner approval, Prava-authorised checkout, provider order tracking, promotion activation, reservation attribution, and reporting.

The MVP must support fixture mode and live mode. Fixture mode is enabled with `USE_FIXTURES=true`.

The MVP stores all monetary values as integer paise. Budget, deadline, price, merchant, discount, and CPA checks are deterministic.

## Features Explicitly Excluded from the MVP

- Database, ORM, or custom persistence layer beyond the stated Google Sheets, n8n Data Tables, and Google Drive records.
- Authentication system.
- Final visual styling or a visual component library.
- Multi-location enterprise management.
- Dynamic pricing optimization across multiple time slots.
- Direct card handling, CVV handling, payment token storage, or payment credential storage.
- Automatic spend approval by OpenAI or any generated recommendation.
- Real external API calls in tests.
- General-purpose campaign management outside the fixed workflow.
