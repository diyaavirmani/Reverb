# Reverb Fill Tableau Dashboard

Build one dashboard named **Reverb Fill Performance and Trust** from the four generated CSV files. Use integer paise as the source unit and format display calculations as INR only in Tableau.

## Data Sources

- `campaign_performance.csv`
- `provider_performance.csv`
- `payment_trust.csv`
- `conversion_funnel.csv`

Do not add customer-level reservation data or payment credentials to the workbook.

## Dashboard Filters

Apply these filters to all compatible worksheets:

- Spot name
- Campaign status
- Provider
- Package
- Slot date range
- Prava status

## 1. Capacity Recovery

KPI formulas:

```text
Recovered Capacity % =
IF SUM([initial_unused_capacity]) = 0 THEN NULL
ELSE SUM([confirmed_guests]) / SUM([initial_unused_capacity])
END

Recovered Guests =
SUM([confirmed_guests])

Remaining Capacity =
SUM([initial_unused_capacity]) - SUM([confirmed_guests])

Estimated Revenue Recovered (INR) =
SUM([estimated_revenue_recovered_paise]) / 100
```

Recommended charts:

- KPI tiles for recovered capacity, recovered guests, remaining capacity, and estimated revenue.
- Horizontal bullet chart by Spot comparing `confirmed_guests` with `initial_unused_capacity`.
- Slot-level bar chart using `capacity_recovery_percent`, sorted descending.

## 2. Campaign Performance

KPI formulas:

```text
Reservation Target Attainment % =
IF SUM([target_reservations]) = 0 THEN NULL
ELSE SUM([confirmed_reservations]) / SUM([target_reservations])
END

Actual CPA (INR) =
IF SUM([confirmed_reservations]) = 0 THEN NULL
ELSE SUM([promotion_spend_paise]) / SUM([confirmed_reservations]) / 100
END

Expected CPA Minimum (INR) =
AVG([expected_cpa_min_paise]) / 100

Expected CPA Maximum (INR) =
AVG([expected_cpa_max_paise]) / 100

Promotion Spend (INR) =
SUM([promotion_spend_paise]) / 100
```

Recommended charts:

- Conversion funnel ordered by `stage_order`, with `stage` on rows and `count` on columns.
- Campaign table showing status, target, confirmed reservations, spend, expected CPA range, and actual CPA.
- Dual-axis chart comparing actual CPA with expected CPA maximum by campaign.

## 3. Provider Trust

KPI formulas:

```text
Weighted Evidence Confidence =
IF SUM([campaign_count]) = 0 THEN NULL
ELSE SUM([evidence_confidence] * [campaign_count]) / SUM([campaign_count])
END

Weighted Local Audience % =
IF SUM([campaign_count]) = 0 THEN NULL
ELSE SUM([local_audience_percent] * [campaign_count]) / SUM([campaign_count])
END

Provider Average CPA (INR) =
IF SUM([reservations]) = 0 THEN NULL
ELSE SUM([spend_paise]) / SUM([reservations]) / 100
END

Activation Success % =
AVG([activation_success_rate]) / 100
```

Recommended charts:

- Provider/package scatter plot with evidence confidence on X, local audience percent on Y, and spend as mark size.
- Highlight table for campaign count, reservations, average CPA, and activation success rate.
- Reference lines at the minimum acceptable evidence confidence and local-audience thresholds.

## 4. Prava Spending Controls

KPI formulas:

```text
Approved Spend (INR) =
SUM([approved_amount_paise]) / 100

Charged Spend (INR) =
SUM([charged_amount_paise]) / 100

Remaining Budget (INR) =
SUM([remaining_budget_paise]) / 100

Budget Compliance % =
IF COUNTD([campaign_id]) = 0 THEN NULL
ELSE SUM(IIF([charged_amount_paise] <= [maximum_budget_paise], 1, 0)) / COUNTD([campaign_id])
END

Price Changes Blocked =
SUM(IIF([price_change_blocked], 1, 0))

Duplicate Attempts Blocked =
SUM(IIF([duplicate_attempt_blocked], 1, 0))
```

Recommended charts:

- Side-by-side bars for maximum budget, approved amount, and charged amount by campaign.
- KPI tiles for budget compliance, price changes blocked, and duplicate attempts blocked.
- Trust table showing campaign, Prava status, merchant order ID, charged amount, and remaining budget.

## Layout

Use a single vertical dashboard with the four numbered sections in order. Keep the global filter row at the top, use consistent INR formatting, and label fixture data clearly during demonstrations.
