import { ImageResponse } from "next/og";

// Generates the PWA / home-screen icons (no binary files needed).
// /pwa-icon/192  /pwa-icon/512  /pwa-icon/180 (iOS)  /pwa-icon/m512 (maskable, extra padding)
export const dynamic = "force-static";

const LOGO = "data:image/png;base64,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";

export function generateStaticParams() {
  return ["192", "512", "180", "m512"].map(size => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const maskable = raw.startsWith("m");
  const size = Number(raw.replace(/\D/g, "")) || 512;
  const logo = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <img src={LOGO} width={logo} height={logo} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
