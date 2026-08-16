import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Full-bleed square — iOS applies the squircle. Same mark as icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#053D26",
          gap: 2,
        }}
      >
        <svg width="78" height="78" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="13" fill="#D9F35A" />
          <path
            d="M5.9 8.4c5.5 3.4 5.5 11.8 0 15.2"
            stroke="#053D26"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M26.1 8.4c-5.5 3.4-5.5 11.8 0 15.2"
            stroke="#053D26"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            display: "flex",
            color: "#FBFDFA",
            fontSize: 72,
            fontFamily: "Georgia, 'Times New Roman', Times, serif",
            fontWeight: 700,
            lineHeight: 1,
            transform: "rotate(90deg)",
            marginTop: -8,
          }}
        >
          {"{"}
        </div>
      </div>
    ),
    { ...size }
  );
}
