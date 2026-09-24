 "use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase-browser";
export default function Reports(){const [orders,setOrders]=useState<any[]>([]);useEffect(()=>{createClient().from("orders").select("status,total").then(({data})=>setOrders(data||[]))},[]);
const sum=orders.reduce((a,x)=>a+Number(x.total||0),0);const delivered=orders.filter(x=>x.status==="delivered").length;const returned=orders.filter(x=>x.status==="returned").length;
return <><div className="top"><div className="title">ანგარიშები</div></div><div className="cards"><div className="card"><div className="muted">შეკვეთები</div><div className="num">{orders.length}</div></div><div className="card"><div className="muted">ჩაბარებული</div><div className="num">{delivered}</div></div><div className="card"><div className="muted">დაბრუნებული</div><div className="num">{returned}</div></div><div className="card"><div className="muted">გაყიდვების ჯამი</div><div className="num">{sum.toFixed(2)} ₾</div></div></div></>
}
