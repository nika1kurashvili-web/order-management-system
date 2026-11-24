import "./globals.css";
import { Noto_Sans_Georgian } from "next/font/google";
import AppShell from "./AppShell";
import PwaRegister from "./PwaRegister";

// Arial has no Georgian glyphs, so browsers fell back to whatever font they had.
const sans = Noto_Sans_Georgian({ subsets: ["georgian", "latin"], display: "swap", variable: "--font-sans" });

export const metadata = {
  title: "Orders Nexo",
  applicationName: "Nexo Orders",
  appleWebApp: { capable: true, title: "Nexo Orders", statusBarStyle: "black-translucent" as const },
  icons: { apple: "/pwa-icon/180" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0f172a" };

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ka" className={sans.variable}><body><AppShell>{children}</AppShell><PwaRegister /></body></html>;
}
