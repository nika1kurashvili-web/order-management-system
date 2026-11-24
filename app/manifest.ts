import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexo Orders",
    short_name: "Nexo Orders",
    description: "შეკვეთების მართვა",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    lang: "ka",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/m512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
