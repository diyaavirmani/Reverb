# Architecture

## Overview

Reverb Fill is a Next.js API application supported by n8n orchestration and integration adapters. The frontend remains minimal until final visual styling is explicitly requested.

The system uses the internal entity name `Spot` for a cafe, restaurant, salon, studio, or other bookable business.

## Core Components

### Next.js API Application

The Next.js App Router application exposes API routes for health checks, campaign workflows, integration callbacks, fixture-mode execution, and live-mode adapter boundaries.

Application code should keep business logic deterministic where money, deadlines, merchants, discounts, and CPA constraints are evaluated.

### n8n Orchestration

n8n coordinates the fixed workflow across owner intake, discovery, verification, approval, checkout, activation, attribution, and reporting steps.

Workflows live under `n8n/workflows`, supporting code lives under `n8n/code`, and workflow notes live under `n8n/docs`.

### Google Sheets Business Records

Google Sheets stores business-readable records such as Spots, owner requests, campaign constraints, package summaries, approvals, reservations, and reporting extracts.

Sheets are for operational visibility and lightweight business records, not critical checkout state.

### n8n Data Tables for Critical Technical State

n8n Data Tables store critical technical state that must be reliable across workflow steps, including idempotency keys, checkout attempts, Prava credential use, merchant operation state, commercial state transitions, and audit event references.

### Google Drive File Storage

Google Drive stores generated artifacts, evidence snapshots, approval exports, reporting files, and other documents that need durable file storage.

### Linq Messaging

Linq handles owner-facing and reservation-facing messages, including approval prompts, status notifications, reservation tracking messages, and reporting delivery.

### OpenAI Generation and Explanation

OpenAI generates campaign copy, explains package options, and prepares owner-facing summaries.

OpenAI does not approve spending, determine payment success, bypass deterministic checks, or replace merchant order confirmation.

### Senso Verification

Senso verifies evidence for promotion packages before they can pass into deterministic filtering and scoring.

Packages without acceptable evidence are rejected before campaign generation or checkout.

### Prava Authorisation

Prava authorises a checkout attempt after owner approval.

A Prava credential must never be reused after a checkout attempt, whether the checkout succeeds, fails, or times out.

### Reach Exchange Provider Checkout

Reach Exchange is the provider checkout layer for purchasing verified local distribution.

The system must never report a successful purchase until a merchant order exists. Payment and merchant operations must be idempotent.

### Reservation Attribution

Reservation attribution links activated promotions to tracked reservations. Test reservations must be clearly labelled and excluded from real performance claims.

### Tableau Analytics

Tableau provides analytics and reporting for campaign outcomes, spend, expected CPA, attributed reservations, conversion performance, and owner-facing summaries.

## Fixed Workflow

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
