import type { CSSProperties } from "react";
export type IconName =
  | "home"
  | "wallet"
  | "arrows"
  | "leaf"
  | "repeat"
  | "people"
  | "settings"
  | "plus"
  | "arrow"
  | "down"
  | "up"
  | "close"
  | "check"
  | "lock"
  | "logout"
  | "search"
  | "bank"
  | "cash"
  | "more"
  | "edit"
  | "calendar"
  | "download"
  | "food";
const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7" />
      <path d="M21 12h-6v5h6" />
      <path d="M17 14.5h.01" />
    </>
  ),
  arrows: (
    <>
      <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3c-9-1-17 3-16 10 1 6 9 7 13 2 3-4 3-8 3-12Z" />
      <path d="M4 21 15 9" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  down: <path d="M12 5v14m-6-6 6 6 6-6" />,
  up: <path d="M12 19V5m-6 6 6-6 6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 3H4v18h5m5-14 5 5-5 5m-5-5h10" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  bank: (
    <>
      <path d="m3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5 12h.01M19 12h.01" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5-11 11H4v-5L15 4Zm-3 3 5 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18m-13 5h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  food: (
    <>
      <path d="M5 3v7m4-7v7M3 3v5a4 4 0 0 0 8 0V3M7 12v9m13 0V3c-5 3-5 10 0 10" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      budgetly<span className="brand-dot">.</span>
    </div>
  );
}
