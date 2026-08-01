# Demo Scenario

## Scenario

A cafe has 12 unused seats for Friday 7-9 PM and wants to fill the slot with at least 6 reservations.

Owner constraints:

- Unused capacity: 12 seats
- Time slot: Friday 7-9 PM
- Reservation target: 6 reservations
- Maximum budget: ₹5,000
- Maximum discount: 15%
- Maximum expected CPA: ₹850

All monetary values are stored as integer paise:

- Maximum budget: 500000 paise
- Maximum expected CPA: 85000 paise

## Promotion Packages

| Package | Merchant | Price | Expected Reservations | Expected CPA | Discount | Deadline | Evidence Status | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| A | Reach Exchange Local Dining Boost | ₹4,800 | 6 | ₹800 | 15% | Before Friday 7 PM | Verified by Senso | Valid winner |
| B | Reach Exchange Neighborhood Food Blast | ₹3,000 | 5 | ₹600 | 10% | Before Friday 7 PM | Rejected by Senso | Evidence rejection |
| C | Reach Exchange Premium Weekend Push | ₹5,400 | 6 | ₹900 | 15% | Before Friday 7 PM | Verified by Senso | CPA and budget rejection |

Integer paise values:

- Package A price: 480000 paise; expected CPA: 80000 paise
- Package B price: 300000 paise; expected CPA: 60000 paise
- Package C price: 540000 paise; expected CPA: 90000 paise

## Deterministic Outcome

Package A is the only valid winner because it has verified Senso evidence, stays within the ₹5,000 budget, meets the Friday 7 PM deadline, respects the 15% maximum discount, and has an expected CPA of ₹800, which is below the ₹850 maximum.

Package B is rejected because Senso evidence verification fails.

Package C is rejected because its price exceeds the ₹5,000 budget and its expected CPA of ₹900 exceeds the ₹850 maximum.

## Campaign and Approval

OpenAI generates the campaign explanation and owner-facing copy for Package A.

The owner approves the spend. OpenAI does not approve spending.

Prava authorises one checkout attempt. The Prava credential is not reused after that attempt.

## Completed Order

Reach Exchange checkout completes and returns a merchant order:

- Merchant order ID: `fixture_reach_order_001`
- Package: Package A
- Order amount: 480000 paise
- Commercial state: promotion purchased

The system reports purchase success only after `fixture_reach_order_001` exists.

## Promotion Activation

The promotion is activated for Friday 7-9 PM with reservation attribution enabled.

## Clearly Labelled Test Reservation

Test reservation:

- Reservation ID: `TEST-reservation-001`
- Label: `TEST RESERVATION - NOT A REAL CUSTOMER`
- Source order: `fixture_reach_order_001`
- Seat count: 2
- Time: Friday 7:30 PM

The test reservation is used only to demonstrate attribution and must not be counted as a real reservation in production reporting.
