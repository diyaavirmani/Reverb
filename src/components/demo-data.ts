import { getDemoCampaignSchedule, getDemoCampaignScheduleForDate } from "./demo-date";
import type { DemoCampaignDraft } from "./demo-state";

const demoSchedule = getDemoCampaignSchedule();

export const demoCampaign = {
  spot: "Café Aura",
  owner: "Isha Malhotra",
  location: "Connaught Place, Delhi",
  title: "Café Aura — Friday Evening Fill Campaign",
  slot: "Friday 7–9 PM",
  date: demoSchedule.date,
  displayDate: demoSchedule.displayDate,
  dateAndTime: `${demoSchedule.displayDate} · 7–9 PM`,
  reservationTime: demoSchedule.reservationTime,
  startTime: "19:00",
  endTime: "21:00",
  unusedCapacity: 12,
  targetReservations: 6,
  maximumBudgetPaise: 500000,
  maximumDiscountPercent: 15,
  maximumCpaPaise: 85000,
  selectedSpendPaise: 300000,
  remainingBudgetPaise: 200000,
  offer: "15% off sharing platters",
  expectedBookings: "4–7",
  worstCaseCpaPaise: 75000,
  bestOptionScore: 92,
  providersChecked: 18,
  status: "Awaiting Approval"
};

export type DemoCampaign = typeof demoCampaign;

export function applyDemoCampaignDraft(campaign: DemoCampaign, draft: DemoCampaignDraft): DemoCampaign {
  const schedule = getDemoCampaignScheduleForDate(draft.date);

  return {
    ...campaign,
    ...draft,
    date: schedule.date,
    displayDate: schedule.displayDate,
    dateAndTime: `${schedule.displayDate} · 7–9 PM`,
    reservationTime: schedule.reservationTime
  };
}

export type DemoProvider = {
  id: string;
  provider: string;
  category: string;
  location: string;
  package: string;
  pricePaise: number;
  expectedBookings: string;
  worstCpaPaise: number;
  score: number;
  decision: "Selected" | "Rejected";
  reason: string;
  warning?: string;
};

export const providers: DemoProvider[] = [
  {
    id: "package_local_dining_boost",
    provider: "Delhi Food Guide",
    category: "Food & Dining",
    location: "Delhi",
    package: "Friday Story Placement",
    pricePaise: 300000,
    expectedBookings: "4–7",
    worstCpaPaise: 75000,
    score: 92,
    decision: "Selected",
    reason: "Best CPA within budget"
  },
  {
    id: "package_campus_eats",
    provider: "Campus Eats",
    category: "Students",
    location: "Delhi",
    package: "Community Feature",
    pricePaise: 200000,
    expectedBookings: "2–3",
    worstCpaPaise: 120000,
    score: 64,
    decision: "Rejected",
    reason: "CPA risk",
    warning: "Below target volume"
  },
  {
    id: "package_weekend_city",
    provider: "Weekend City Bulletin",
    category: "Lifestyle",
    location: "Delhi",
    package: "Bulletin Spotlight",
    pricePaise: 450000,
    expectedBookings: "3–4",
    worstCpaPaise: 150000,
    score: 58,
    decision: "Rejected",
    reason: "Low expected efficiency",
    warning: "Above CPA limit"
  },
  {
    id: "package_local_hangout",
    provider: "Local Hangout Club",
    category: "Community",
    location: "Delhi",
    package: "Collab Feature",
    pricePaise: 150000,
    expectedBookings: "1–2",
    worstCpaPaise: 150000,
    score: 41,
    decision: "Rejected",
    reason: "Low impact",
    warning: "Weak expected recovery"
  }
];

export const selectedProvider = providers[0];

export const creative = {
  headline: "FRIDAY VIBES",
  discount: "15% OFF",
  offer: "SHARING PLATTERS",
  time: "7:00 PM – 9:00 PM",
  cta: "BOOK YOUR TABLE NOW!",
  caption:
    "Friday plans?\n\nJoin us between 7 PM – 9 PM and enjoy 15% off sharing platters at Café Aura.\n\nGreat food. Good vibes. Good company.\n\n#CafeAura #FridayVibes #GoodFood"
};

export const workflow = [
  "Campaign Request",
  "Verified Discovery",
  "Agent Decision",
  "Creative Review",
  "Campaign Approval",
  "Campaign Launch",
  "Reservations"
] as const;

export const trustItems = [
  { title: "Verified Providers", detail: "Evidence First", icon: "shield" as const },
  { title: "Controlled Spend", detail: "Budget Safe", icon: "wallet" as const },
  { title: "Deterministic Decisions", detail: "Policy Constrained", icon: "spark" as const },
  { title: "Measured Results", detail: "Reservations Tracked", icon: "chart" as const }
];

export const benefitItems = [
  { title: "Complete Control", detail: "You approve every campaign before anything launches.", icon: "shield" as const },
  { title: "Verified & Reliable", detail: "Every provider is evaluated against deterministic evidence.", icon: "approval" as const },
  { title: "Controlled Spend", detail: "Budget, CPA, and discount limits remain protected.", icon: "wallet" as const },
  { title: "Measurable Results", detail: "Reservations and recovered capacity stay visible.", icon: "chart" as const }
];

export const testimonials = [
  {
    initials: "IM",
    name: "Isha Malhotra",
    role: "Owner, Café Aura",
    quote: "Finally, a system that helps fill our quiet hours without giving up control of the budget.",
    result: "+34% off-hour footfall"
  },
  {
    initials: "RS",
    name: "Raghav S.",
    role: "Owner, Brew & Co.",
    quote: "Reverb selected the package, respected our limits, and made the campaign easy to approve.",
    result: "+26% revenue lift",
    featured: true
  },
  {
    initials: "NP",
    name: "Neeraj P.",
    role: "Owner, Local Street Kitchen",
    quote: "The system respects the budget. I approve the campaign, then track what actually happened.",
    result: "-19% CPA"
  }
];

export const venueChips = ["Café Aura", "Delhi Food Guide", "Campus Eats", "Weekend City", "Local Hangout Club", "Brew & Co."];

export const baseReservations = [
  { id: "A7K2", time: "7:15 PM", partySize: 2, revenuePaise: 215000, cpaPaise: 71000 },
  { id: "B9L1", time: "7:35 PM", partySize: 4, revenuePaise: 430000, cpaPaise: 71000 },
  { id: "C3M8", time: "8:10 PM", partySize: 2, revenuePaise: 215000, cpaPaise: 71000 },
  { id: "D2N5", time: "8:35 PM", partySize: 3, revenuePaise: 322500, cpaPaise: 71000 }
];

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function getPerformanceLabels(date: string) {
  const campaignDate = new Date(`${date}T00:00:00.000Z`);
  return [-21, -14, -7, 0].map((offset) => {
    const current = new Date(campaignDate);
    current.setUTCDate(current.getUTCDate() + offset);
    return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: "UTC" }).format(current);
  });
}
