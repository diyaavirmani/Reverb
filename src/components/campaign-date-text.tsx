"use client";

import { useEffect, useState } from "react";

import { formatDemoCampaignDate } from "./demo-date";
import { loadDemoCampaignDraft } from "./demo-state";

export function CampaignDateText({ date }: { date: string }) {
  const [activeDate, setActiveDate] = useState(date);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = loadDemoCampaignDraft();
      if (stored) setActiveDate(stored.date);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return <>{formatDemoCampaignDate(activeDate)}</>;
}