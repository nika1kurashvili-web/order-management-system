"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";

export default function DashboardLayout({children}:{children:React.ReactNode}){
 const [ready,setReady]=useState(false); const [role,setRole]=useState(""); const router=useRouter();
 useEffect(()=>{(async()=>{const c=createClient();const {data}=await c.auth.getUser();if(!data.user){router.replace("/login");return}const {data:p}=await c.from("profiles").select("role").eq("id",data.user.id).single();setRole(p?.role||"operator");setReady(true)})()},[router]);
 async function logout(){await createClient().auth.signOut();router.replace("/login")}
 if(!ready)return <div className="login"><div className="loginbox">იტვირთება...</div></div>;
 return <div className="shell"><aside className="side"><div className="brand">📦 Orders</div><nav className="nav"><Link href="/dashboard">📊 Dashboard</Link><Link href="/orders/new">➕ ახალი შეკვეთა</Link><Link href="/products">🛒 პროდუქტები</Link>{role==="admin"&&<Link href="/employees">👥 თანამშრომლები</Link>}<Link href="/reports">📈 ანალიტიკა</Link></nav><div className="role-chip">{role==="admin"?"Admin":"Operator"}</div><button className="btn secondary" style={{marginTop:12,width:"100%"}} onClick={logout}>გასვლა</button></aside><main className="main">{children}</main></div>
}
