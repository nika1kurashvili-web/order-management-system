import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Order Management System" };

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ka"><body>{children}</body></html>;
}
