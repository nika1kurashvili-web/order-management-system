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

      if (((pathname === "/reports" || pathname === "/onway-status") && !["admin", "manager"].includes(userRole)) ||
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
    return <div className="login"><div className="loginbox loading"><span className="spinner" />იტვირთება...</div></div>;
  }

  // `short` is the label under the icon in the phone bottom bar.
  const links = [
    { href: "/dashboard", icon: "📊", label: "Dashboard", short: "მთავარი", show: true },
    { href: "/orders/new", icon: "➕", label: "ახალი შეკვეთა", short: "ახალი", show: role === "admin" || role === "operator" },
    { href: "/products", icon: "🛒", label: "პროდუქტები", short: "პროდუქტი", show: true },
    { href: "/excel-price-fill", icon: "📄", label: "Extra", short: "Extra", show: role === "admin" },
    { href: "/employees", icon: "👥", label: "თანამშრომლები", short: "გუნდი", show: role === "admin" },
    { href: "/reports", icon: "📈", label: "ანალიტიკა", short: "ანალიტიკა", show: role === "admin" || role === "manager" },
  ].filter((l) => l.show);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard" || (pathname.startsWith("/orders/") && pathname !== "/orders/new")
      : pathname === href || pathname.startsWith(href + "/");

  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "მენეჯერი" : "Operator";
  const brand = (
    <div className="brand">
      <span className="brand-mark">N</span>
      <span className="brand-text">Orders Nexo<small>შეკვეთების სისტემა</small></span>
    </div>
  );

  return (
    <div className="shell">
      <header className="mobile-top">
        {brand}
        <div className="mobile-top-actions">
          <span className="role-chip">{roleLabel}</span>
          <button className="btn secondary" onClick={logout}>გასვლა</button>
        </div>
      </header>

      <aside className="side" style={{ "--nav-count": links.length } as React.CSSProperties}>
        {brand}
        <nav className="nav">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href} title={l.label} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                <span className="nav-ico" aria-hidden="true">{l.icon}</span>
                <span className="nav-label">{l.label}</span>
                <span className="nav-short">{l.short}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-chip">{roleLabel}</div>
          <button className="btn secondary sidebar-logout" onClick={logout}>გასვლა</button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
