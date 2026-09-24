
</> TypeScript

"use client";

import Link from "next/link";
import {createClient} from "@/lib/supabase-browser";

export default function DashboardLayout({children}:{children:React.ReactNode}){
 async function logout(){const c=createClient();await c.auth.signOut();window.location.href="/login";}
 return <div className="shell"><aside className="side"><div className="brand">📦 Orders</div><nav className="nav"><Link href="/dashboard">📊 Dashboard</Link><Link href="/orders/new">➕ ახალი შეკვეთა</Link><Link href="/products">🛒 პროდუქტები</Link><Link href="/employees">👥 თანამშრომლები</Link><Link href="/reports">📈 ანგარიშები</Link></nav><button className="btn secondary" style={{marginTop:30,width:"100%"}} onClick={logout}>გასვლა</button></aside><main className="main">{children}</main></div>
}
