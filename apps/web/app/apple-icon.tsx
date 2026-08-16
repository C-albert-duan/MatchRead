import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Full-bleed square — iOS applies the squircle. Same ball as icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#053D26",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="10" fill="#D9F35A" />
          <path
            d="M8.2 10.2c4.2 2.6 4.2 9 0 11.6"
            stroke="#053D26"
            strokeWidth="1.85"
            strokeLinecap="round"
          />
          <path
            d="M23.8 10.2c-4.2 2.6-4.2 9 0 11.6"
            stroke="#053D26"
            strokeWidth="1.85"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
