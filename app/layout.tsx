import "./globals.css";
import AppShell from "./AppShell";

export const metadata = {
  title: "Order Management System",
  description: "Online order management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
