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

    setReady(false);
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

      if (profile?.active !== true || !["admin", "operator", "manager"].includes(profile?.role || "")) {
        await c.auth.signOut();
        router.replace("/login");
        return;
      }

      const userRole = profile.role;
      setRole(userRole);

      if ((pathname === "/reports" && !["admin", "manager"].includes(userRole)) ||
    (pathname === "/employees" && userRole !== "admin") ||
    (pathname === "/excel-price-fill" && userRole !== "admin") ||
    (pathname === "/orders/new" && !["admin", "operator"].includes(userRole))) {
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
      <aside className="side" style={{ "--mobile-nav-count": role === "admin" ? 5 : 3 } as React.CSSProperties}>
        <div>
          <div className="brand">📦 Orders</div>
          <nav className="nav">
            <Link href="/dashboard">📊 Dashboard</Link>
            {(role === "admin" || role === "operator") && <Link href="/orders/new">➕ ახალი შეკვეთა</Link>}
            <Link href="/products">🛒 პროდუქტები</Link>
{role === "admin" && (
  <Link href="/excel-price-fill">📄 Extra</Link>
)}
            {role === "admin" && <Link href="/employees">👥 თანამშრომლები</Link>}
            {(role === "admin" || role === "manager") && <Link href="/reports">📈 ანალიტიკა</Link>}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="role-chip">{role === "admin" ? "Admin" : role === "manager" ? "მენეჯერი" : "Operator"}</div>
          <button className="btn secondary sidebar-logout" onClick={logout}>გასვლა</button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
