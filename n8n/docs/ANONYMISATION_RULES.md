# Reporting Anonymisation Rules

These rules apply before campaign data is written to shared Drive artifacts or sent by Gmail.

## Allowed Reservation Fields

- reservation time
- party size
- booking status
- `isDemoBooking`
- visible demo label when applicable

## Excluded Reservation Fields

- customer name
- customer contact details
- `customerReference`
- tracking code or source
- activation or attribution identifiers
- raw inbound event data

## Financial Allowlist

Shared transaction summaries may contain only:

- internal transaction ID
- merchant order ID
- transaction status
- merchant order status
- currency
- amount in integer paise

Card data, CVV, PAN, secrets, credentials, bearer values, one-time authorisation values, and payment tokens are prohibited.

## Audit Events

Reports retain only event type, occurrence time, previous state, and next state. Raw metadata is excluded because it may contain operational identifiers that are unnecessary for the owner report.

## Demo Reservations

Every demo reservation must retain `isDemoBooking=true` and a label containing `TEST`. Demo reservations appear as labelled records but are excluded from reported reservation, guest, capacity recovery, actual CPA, and estimated revenue totals.
