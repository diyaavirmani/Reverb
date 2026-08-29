import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "plus"
  | "search"
  | "review"
  | "approval"
  | "calendar"
  | "chart"
  | "audit"
  | "settings"
  | "reservation"
  | "shield"
  | "wallet"
  | "spark"
  | "arrow"
  | "check"
  | "users"
  | "seat"
  | "target"
  | "clock"
  | "store"
  | "edit"
  | "download"
  | "filter"
  | "chevron";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    review: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    approval: <><path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.7 7.5 9.5 4.4-1.8 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.7 12 2.1 2.1 4.6-4.6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    audit: <><path d="M8 4h10l2 2v14H8z" /><path d="M12 9h5M12 13h5M12 17h3" /><path d="m3 13 2 2 3-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    reservation: <><path d="M5 4h14v16H5z" /><path d="M8 2v4M16 2v4M8 10h8M8 14h5" /></>,
    shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.7 7.5 9.5 4.4-1.8 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.7 12 2.1 2.1 4.6-4.6" /></>,
    wallet: <><path d="M3 7h16v13H3z" /><path d="M3 7V5h13v2M15 12h6v4h-6z" /></>,
    spark: <><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2.7-6 6-6s6 2 6 6" /><circle cx="17" cy="9" r="2.3" /><path d="M16 15c3.1 0 5 1.8 5 5" /></>,
    seat: <><path d="M6 12V7a3 3 0 0 1 6 0v5" /><path d="M4 12h16v5H4zM6 17v4M18 17v4" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="m3 10 2-6h14l2 6" /><path d="M8 20v-6h8v6M3 10c1.5 2 3 2 4.5 0 1.5 2 3 2 4.5 0 1.5 2 3 2 4.5 0 1.5 2 3 2 4.5 0" /></>,
    edit: <><path d="m4 20 4.2-1 11-11-3.2-3.2-11 11L4 20Z" /><path d="m14.7 6.1 3.2 3.2" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5M5 21h14" /></>,
    filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
    chevron: <path d="m9 6 6 6-6 6" />
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
