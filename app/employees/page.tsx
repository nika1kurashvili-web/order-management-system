 "use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase-browser";
export default function Employees(){const [items,setItems]=useState<any[]>([]);useEffect(()=>{createClient().from("profiles").select("*").order("full_name").then(({data})=>setItems(data||[]))},[]);
return <><div className="top"><div className="title">თანამშრომლები</div></div><div className="panel"><p className="muted">ახალი მომხმარებლის შექმნა კეთდება Supabase Authentication-ში; შექმნის შემდეგ პროფილი ავტომატურად იქმნება.</p><table className="table"><thead><tr><th>სახელი</th><th>როლი</th><th>ტელეფონი</th><th>სტატუსი</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.full_name}</td><td>{x.role}</td><td>{x.phone||"—"}</td><td>{x.active?"აქტიური":"არააქტიური"}</td></tr>)}</tbody></table></div></>
}
