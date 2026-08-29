"use client";

import { useMemo, useState } from "react";

import { getDemoCalendarMonth, shiftDemoCalendarMonth } from "./demo-date";
import { Icon } from "./icons";

type CampaignCalendarProps = {
  selectedDate: string;
  displayDate: string;
  referenceDate: string | null;
  onSelect: (date: string) => void;
};

export function CampaignCalendar({ selectedDate, displayDate, referenceDate, onSelect }: CampaignCalendarProps) {
  const [viewMonthOverride, setViewMonthOverride] = useState<string | null>(null);
  const viewMonth = viewMonthOverride ?? shiftDemoCalendarMonth(selectedDate, 0);

  const calendar = useMemo(
    () => getDemoCalendarMonth(viewMonth, selectedDate, referenceDate),
    [referenceDate, selectedDate, viewMonth]
  );

  function selectDate(date: string, selectable: boolean) {
    if (!selectable) return;
    setViewMonthOverride(null);
    onSelect(date);
  }

  return (
    <>
      <div className="schedule-title">
        <span className="schedule-heading"><strong>Campaign Schedule</strong><small>{displayDate}</small></span>
        <div className="calendar-navigation">
          <button
            aria-label="Previous month"
            title="Previous month"
            type="button"
            onClick={() => setViewMonthOverride(shiftDemoCalendarMonth(viewMonth, -1))}
          >
            <Icon name="chevron" />
          </button>
          <b aria-live="polite">{calendar.monthLabel}</b>
          <button
            aria-label="Next month"
            title="Next month"
            type="button"
            onClick={() => setViewMonthOverride(shiftDemoCalendarMonth(viewMonth, 1))}
          >
            <Icon name="chevron" />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">
        {calendar.days.map((day) => {
          const className = [
            day.selected ? "active" : "",
            day.recurringFriday ? "scheduled" : "",
            !day.inCurrentMonth ? "outside-month" : "",
            day.past ? "past" : ""
          ].filter(Boolean).join(" ");

          return (
            <button
              aria-label={`${day.date}${day.recurringFriday ? ", recurring Friday" : ""}`}
              aria-pressed={day.selected}
              className={className}
              disabled={!day.selectable}
              key={day.date}
              type="button"
              onClick={() => selectDate(day.date, day.selectable)}
            >
              {day.day}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend"><span><i className="active" /> Campaign date</span><span><i className="scheduled" /> Other Fridays</span></div>
    </>
  );
}