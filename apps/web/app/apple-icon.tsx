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
          alignItems: "center",
          justifyContent: "center",
          background: "#053D26",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 32 32" fill="none">
          <path
            d="M5.5 9.75h7.25v12.5H5.5"
            stroke="#FBFDFA"
            strokeWidth="2.15"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <circle cx="21.1" cy="16" r="8.4" fill="#D9F35A" />
          <path
            d="M14.55 11.13c3.53 2.18 3.53 7.56 0 9.74"
            stroke="#053D26"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path
            d="M27.65 11.13c-3.53 2.18-3.53 7.56 0 9.74"
            stroke="#053D26"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
