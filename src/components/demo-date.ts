const friday = 5;
const dayInMilliseconds = 24 * 60 * 60 * 1000;
const demoTimezone = "Asia/Kolkata";
const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DemoCampaignSchedule = {
  date: string;
  displayDate: string;
  slot: string;
  reservationTime: string;
};

export type DemoCalendarDay = {
  date: string;
  day: number;
  weekday: number;
  inCurrentMonth: boolean;
  selected: boolean;
  recurringFriday: boolean;
  past: boolean;
  selectable: boolean;
};

export type DemoCalendarMonth = {
  monthDate: string;
  monthLabel: string;
  year: number;
  month: number;
  days: DemoCalendarDay[];
};

export function getDemoCampaignSchedule(baseDate = new Date()): DemoCampaignSchedule {
  return getDemoCampaignScheduleForDate(formatDateInputValue(getNextFriday(baseDate)));
}

export function getDemoCampaignScheduleForDate(date: string): DemoCampaignSchedule {
  const campaignDate = parseDateOnly(date);
  const displayDate = formatDisplayDate(campaignDate);
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" }).format(campaignDate);

  return {
    date,
    displayDate,
    slot: `${displayDate} - ${weekday} 7-9 PM`,
    reservationTime: `${date}T14:00:00.000Z`
  };
}

export function getDemoCalendarMonth(
  viewDate: string,
  selectedDate: string,
  referenceDate: Date | string | null = null
): DemoCalendarMonth {
  const view = parseDateOnly(viewDate);
  const year = view.getUTCFullYear();
  const monthIndex = view.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cellCount = Math.max(35, Math.ceil((firstWeekday + daysInMonth) / 7) * 7);
  const firstCell = new Date(Date.UTC(year, monthIndex, 1 - firstWeekday));
  const today = referenceDate instanceof Date
    ? getDemoTodayDate(referenceDate)
    : referenceDate;

  const days = Array.from({ length: cellCount }, (_, index) => {
    const current = new Date(firstCell.getTime() + index * dayInMilliseconds);
    const date = formatDateInputValue(current);
    const inCurrentMonth = current.getUTCMonth() === monthIndex;
    const selected = date === selectedDate;
    const past = today !== null && date < today;

    return {
      date,
      day: current.getUTCDate(),
      weekday: current.getUTCDay(),
      inCurrentMonth,
      selected,
      recurringFriday: inCurrentMonth && current.getUTCDay() === friday && !selected,
      past,
      selectable: !past
    };
  });

  return {
    monthDate: formatDateInputValue(new Date(Date.UTC(year, monthIndex, 1))),
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(year, monthIndex, 1))),
    year,
    month: monthIndex + 1,
    days
  };
}

export function shiftDemoCalendarMonth(viewDate: string, offset: number): string {
  const view = parseDateOnly(viewDate);
  return formatDateInputValue(new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + offset, 1)));
}

export function getDemoTodayDate(referenceDate = new Date()): string {
  const calendarDate = getDemoCalendarDate(referenceDate);
  return formatDateInputValue(new Date(Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day)));
}

export function isPastDemoDate(date: string, referenceDate: Date | string = new Date()): boolean {
  parseDateOnly(date);
  const today = referenceDate instanceof Date ? getDemoTodayDate(referenceDate) : formatDateInputValue(parseDateOnly(referenceDate));
  return date < today;
}

export function isValidDemoDate(date: string): boolean {
  try {
    parseDateOnly(date);
    return true;
  } catch {
    return false;
  }
}

export function formatDemoCampaignDate(date: string): string {
  return formatDisplayDate(parseDateOnly(date));
}

function getNextFriday(baseDate: Date): Date {
  const demoCalendarDate = getDemoCalendarDate(baseDate);
  const normalizedBase = new Date(
    Date.UTC(demoCalendarDate.year, demoCalendarDate.month - 1, demoCalendarDate.day)
  );
  const daysUntilFriday = (friday - normalizedBase.getUTCDay() + 7) % 7 || 7;

  return new Date(normalizedBase.getTime() + daysUntilFriday * dayInMilliseconds);
}

function getDemoCalendarDate(baseDate: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: demoTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(baseDate);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Unable to calculate demo campaign date.");
  }

  return { year, month, day };
}

function parseDateOnly(value: string): Date {
  const match = dateOnlyPattern.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return date;
}

function formatDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}