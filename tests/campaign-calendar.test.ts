import { describe, expect, it } from "vitest";

import {
  getDemoCalendarMonth,
  getDemoTodayDate,
  isPastDemoDate,
  shiftDemoCalendarMonth
} from "../src/components/demo-date";

describe("real campaign calendar", () => {
  it("places September 4, 2026 under Friday", () => {
    const calendar = getDemoCalendarMonth("2026-09-04", "2026-09-04", "2026-08-29");
    const campaignDay = calendar.days.find((day) => day.date === "2026-09-04");

    expect(campaignDay?.weekday).toBe(5);
  });

  it("calculates the correct number of days in a normal month", () => {
    const calendar = getDemoCalendarMonth("2026-09-04", "2026-09-04", "2026-08-29");

    expect(calendar.days.filter((day) => day.inCurrentMonth)).toHaveLength(30);
    expect(calendar.days.some((day) => !day.inCurrentMonth)).toBe(true);
  });

  it("handles leap-year February with Gregorian rules", () => {
    const leapYear = getDemoCalendarMonth("2028-02-01", "2028-02-04", "2028-01-01");
    const normalYear = getDemoCalendarMonth("2026-02-01", "2026-02-06", "2026-01-01");

    expect(leapYear.days.filter((day) => day.inCurrentMonth)).toHaveLength(29);
    expect(normalYear.days.filter((day) => day.inCurrentMonth)).toHaveLength(28);
  });

  it("calculates previous and next month navigation", () => {
    expect(shiftDemoCalendarMonth("2026-09-04", -1)).toBe("2026-08-01");
    expect(shiftDemoCalendarMonth("2026-09-04", 1)).toBe("2026-10-01");
    expect(shiftDemoCalendarMonth("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("marks the selected campaign date", () => {
    const calendar = getDemoCalendarMonth("2026-09-01", "2026-09-04", "2026-08-29");
    const selected = calendar.days.filter((day) => day.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.date).toBe("2026-09-04");
  });

  it("derives other recurring Fridays from weekday calculations", () => {
    const calendar = getDemoCalendarMonth("2026-09-01", "2026-09-04", "2026-08-29");
    const recurring = calendar.days.filter((day) => day.recurringFriday);

    expect(recurring.map((day) => day.date)).toEqual(["2026-09-11", "2026-09-18", "2026-09-25"]);
    expect(recurring.every((day) => day.weekday === 5)).toBe(true);
  });

  it("prevents past dates from being selected", () => {
    const calendar = getDemoCalendarMonth("2026-09-01", "2026-09-04", "2026-09-04");
    const pastDay = calendar.days.find((day) => day.date === "2026-09-03");
    const currentDay = calendar.days.find((day) => day.date === "2026-09-04");

    expect(pastDay).toMatchObject({ past: true, selectable: false });
    expect(currentDay).toMatchObject({ past: false, selectable: true });
    expect(isPastDemoDate("2026-09-03", "2026-09-04")).toBe(true);
  });

  it("uses a supplied reference time deterministically in Asia/Kolkata", () => {
    const reference = new Date("2026-08-28T20:00:00.000Z");

    expect(getDemoTodayDate(reference)).toBe("2026-08-29");
    expect(isPastDemoDate("2026-08-28", reference)).toBe(true);
    expect(isPastDemoDate("2026-08-29", reference)).toBe(false);
  });
});