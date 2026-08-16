/** MatchRead mark — tennis ball on clubhouse green. */
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
      <circle cx="16" cy="16" r="10" fill="#D9F35A" />
      <path
        d="M8.2 10.2c4.2 2.6 4.2 9 0 11.6"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M23.8 10.2c-4.2 2.6-4.2 9 0 11.6"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}
