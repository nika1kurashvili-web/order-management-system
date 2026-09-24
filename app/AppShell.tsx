"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState("");

  const isLogin = pathname === "/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }

    (async () => {
      const c = createClient();
      const { data } = await c.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await c
        .from("profiles")
        .select("role,active")
        .eq("id", data.user.id)
        .single();

      if (profile?.active === false) {
        await c.auth.signOut();
        router.replace("/login");
        return;
      }

      const userRole = profile?.role || "operator";
      setRole(userRole);

      if (pathname === "/reports" && userRole !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setReady(true);
    })();
  }, [pathname, router, isLogin]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  if (isLogin) return <>{children}</>;

  if (!ready) {
    return <div className="login"><div className="loginbox">იტვირთება...</div></div>;
  }

  return (
    <div className="shell">
      <aside className="side">
        <div>
          <div className="brand">📦 Orders</div>
          <nav className="nav">
            <Link href="/dashboard">📊 Dashboard</Link>
            <Link href="/orders/new">➕ ახალი შეკვეთა</Link>
            <Link href="/products">🛒 პროდუქტები</Link>
            {role === "admin" && <Link href="/employees">👥 თანამშრომლები</Link>}
            {role === "admin" && <Link href="/reports">📈 ანალიტიკა</Link>}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="role-chip">{role === "admin" ? "Admin" : "Operator"}</div>
          <button className="btn secondary sidebar-logout" onClick={logout}>გასვლა</button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
