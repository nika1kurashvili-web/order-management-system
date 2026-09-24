"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <nav className="flex gap-6">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/orders/new">ახალი შეკვეთა</Link>
            <Link href="/products">პროდუქტები</Link>
            <Link href="/employees">თანამშრომლები</Link>
            <Link href="/reports">ანგარიშები</Link>
          </nav>

          <button
            onClick={logout}
            className="rounded-lg border px-4 py-2"
          >
            გასვლა
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}