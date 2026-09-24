 "use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase-browser";
import {Status} from "@/lib/types";

const labels:Record<Status,string>={new:"ახალი",confirmed:"დადასტურებული",shipping:"იგზავნება",delivered:"ჩაბარდა",returned:"დაბრუნდა",cancelled:"გაუქმდა"};

export default function Dashboard(){
 const [orders,setOrders]=useState<any[]>([]); const [loading,setLoading]=useState(true);
 async function load(){const {data}=await createClient().from("orders").select("*,profiles(full_name)").order("created_at",{ascending:false}).limit(100);setOrders(data||[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 const count=(s:Status)=>orders.filter(x=>x.status===s).length;
 return <><div className="top"><div><div className="title">Dashboard</div><div className="muted">შეკვეთების მართვა</div></div><Link className="btn" href="/orders/new">+ ახალი შეკვეთა</Link></div>
 <div className="cards">{(["new","confirmed","shipping","delivered","returned","cancelled"] as Status[]).map(s=><div className="card" key={s}><div className="muted">{labels[s]}</div><div className="num">{count(s)}</div></div>)}</div>
 <div className="panel"><h3>ბოლო შეკვეთები</h3>{loading?<p>იტვირთება...</p>:<table className="table"><thead><tr><th>№</th><th>მომხმარებელი</th><th>თანამშრომელი</th><th>ჯამი</th><th>სტატუსი</th><th></th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>#{o.order_number}</td><td>{o.customer_name}<br/><span className="muted">{o.customer_phone}</span></td><td>{o.profiles?.full_name||"—"}</td><td>{Number(o.total).toFixed(2)} ₾</td><td><span className="badge">{labels[o.status as Status]}</span></td><td><Link className="btn secondary" href={`/orders/${o.id}`}>ნახვა</Link></td></tr>)}</tbody></table>}</div></>
}
