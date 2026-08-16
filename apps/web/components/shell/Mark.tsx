/** MatchRead mark — tennis ball over a { rotated 90° clockwise. */
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
      <circle cx="16" cy="10.5" r="7" fill="#D9F35A" />
      <path
        d="M10.55 6.4c2.95 1.8 2.95 6.4 0 8.2"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M21.45 6.4c-2.95 1.8-2.95 6.4 0 8.2"
        fill="none"
        stroke="#053D26"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <text
        x="16"
        y="24.5"
        fill="#FBFDFA"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="17"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(90 16 24.5)"
      >
        {"{"}
      </text>
    </svg>
  );
}
