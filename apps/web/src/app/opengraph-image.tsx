import { ImageResponse } from "next/og";
export const alt = "FresherJobs AI — Your career starts here";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f7f5ef",
        padding: 80,
        flexDirection: "column",
        justifyContent: "space-between",
        color: "#242127",
      }}
    >
      <div style={{ display: "flex", fontSize: 32 }}>↗ FresherJobs AI</div>
      <div
        style={{
          display: "flex",
          fontSize: 100,
          lineHeight: 1,
          letterSpacing: -5,
        }}
      >
        Your career
        <br />
        starts here.
      </div>
      <div style={{ display: "flex", color: "#7654d6", fontSize: 24 }}>
        Big potential. Better beginnings.
      </div>
    </div>,
    size,
  );
}
