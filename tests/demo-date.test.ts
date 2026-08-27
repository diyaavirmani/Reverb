import { describe, expect, it } from "vitest";

import { getDemoCampaignSchedule } from "../src/components/demo-date";

describe("demo campaign date helper", () => {
  it("returns the next future Friday when the reference date is Friday", () => {
    const schedule = getDemoCampaignSchedule(new Date("2026-08-28T08:00:00.000Z"));

    expect(schedule.date).toBe("2026-09-04");
    expect(schedule.displayDate).toContain("2026");
    expect(schedule.slot).toContain("Friday 7-9 PM");
    expect(schedule.reservationTime).toBe("2026-09-04T14:00:00.000Z");
  });

  it("uses the same date across the returned schedule values", () => {
    const schedule = getDemoCampaignSchedule(new Date("2026-08-29T08:00:00.000Z"));

    expect(schedule.date).toBe("2026-09-04");
    expect(schedule.slot).toContain(schedule.displayDate);
    expect(schedule.reservationTime.startsWith(schedule.date)).toBe(true);
  });

  it("uses the demo timezone when the UTC date is still Thursday", () => {
    const schedule = getDemoCampaignSchedule(new Date("2026-08-27T20:00:00.000Z"));

    expect(schedule.date).toBe("2026-09-04");
  });
});
