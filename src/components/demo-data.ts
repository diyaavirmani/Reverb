export const demoCampaign = {
  spot: "Quiet Cup Cafe",
  title: "Quiet Cup Cafe - Friday Evening Fill Campaign",
  slot: "Friday 7-9 PM",
  date: "2026-08-07",
  startTime: "19:00",
  endTime: "21:00",
  unusedCapacity: 12,
  targetReservations: 6,
  maximumBudgetPaise: 500000,
  maximumDiscountPercent: 15,
  maximumCpaPaise: 85000,
  selectedSpendPaise: 480000,
  expectedBookings: "6",
  expectedCpaRange: "Rs 800",
  remainingBudgetPaise: 20000,
  estimatedRevenueRecoveredPaise: 250000,
  statusDraft: "Create Campaign",
  statusActive: "Campaign Active"
};

export const providers = [
  {
    id: "package_local_dining_boost",
    provider: "Reach Exchange Local Dining Boost",
    package: "Local Dining Boost",
    verificationStatus: "Verified Provider",
    pricePaise: 480000,
    expectedBookings: "6",
    expectedCpa: "Rs 800",
    score: 90,
    decision: "Recommended",
    reason:
      "Best eligible package after deterministic checks for budget, CPA, deadline, discount, merchant, and availability.",
    badge: "success" as const
  },
  {
    id: "package_neighborhood_food_blast",
    provider: "Reach Exchange Neighborhood Food Blast",
    package: "Neighborhood Food Blast",
    verificationStatus: "Not verified",
    pricePaise: 300000,
    expectedBookings: "5",
    expectedCpa: "Rs 600",
    score: 34,
    decision: "Rejected",
    reason: "Rejected because local audience evidence is weak.",
    badge: "danger" as const
  },
  {
    id: "package_premium_weekend_push",
    provider: "Reach Exchange Premium Weekend Push",
    package: "Premium Weekend Push",
    verificationStatus: "Verified Provider",
    pricePaise: 540000,
    expectedBookings: "6",
    expectedCpa: "Rs 900",
    score: 51,
    decision: "Rejected",
    reason: "Rejected because price exceeds budget and worst-case CPA exceeds Rs 850.",
    badge: "warning" as const
  }
];

export const selectedProvider = providers[0];

export const creative = {
  headline: "Make Friday dinner feel full again",
  caption:
    "Quiet Cup Cafe has a limited Friday 7-9 PM table window for local diners looking for an easy evening plan.",
  offer: "15% off sharing platters for the Friday 7-9 PM slot.",
  cta: "Reserve your table"
};

export const workflow = [
  "Create Campaign",
  "Recommended Promotion",
  "Campaign Preview",
  "Campaign Approval",
  "Campaign Active",
  "Reservation",
  "Performance"
];

export function formatRupees(paise: number): string {
  return `Rs ${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
