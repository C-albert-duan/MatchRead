/** MatchRead mark — tennis ball advancing from a first-round fork. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="#053D26" />
      <path
        d="M5.5 9.75h7.25v12.5H5.5"
        fill="none"
        stroke="#FBFDFA"
        strokeWidth="2.15"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="21.1" cy="16" r="8.4" fill="#D9F35A" />
      <path
        d="M14.55 11.13c3.53 2.18 3.53 7.56 0 9.74"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M27.65 11.13c-3.53 2.18-3.53 7.56 0 9.74"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}
