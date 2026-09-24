"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Status } from "@/lib/types";
import * as XLSX from "xlsx";

const labels: Record<Status, string> = { new: "ახალი", confirmed: "დადასტურებული", shipping: "გზაშია", delivered: "ჩაბარდა", returned: "დაბრუნდა", cancelled: "გაუქმდა" };

type Order = { id:string; order_number:number; customer_name:string; customer_phone:string; total:number; status:Status; created_at:string; profiles?:{full_name:string|null}|null };
type Item = { order_id:string; product_name:string; quantity:number; unit_price:number; total_price:number };

export default function Dashboard(){
 const [orders,setOrders]=useState<Order[]>([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState(""); const [status,setStatus]=useState<"all"|Status>("all"); const [dateFrom,setDateFrom]=useState(""); const [dateTo,setDateTo]=useState(""); const [exporting,setExporting]=useState(false);
 async function load(){setLoading(true);const {data}=await createClient().from("orders").select("*,profiles(full_name)").order("created_at",{ascending:false}).limit(1000);setOrders((data||[]) as Order[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 const filtered=useMemo(()=>orders.filter(o=>{const q=search.trim().toLowerCase(); const matchesSearch=!q||String(o.order_number).includes(q)||(o.customer_name||"").toLowerCase().includes(q)||(o.customer_phone||"").includes(q)||(o.profiles?.full_name||"").toLowerCase().includes(q); const matchesStatus=status==="all"||o.status===status; const d=new Date(o.created_at); const from=dateFrom?new Date(`${dateFrom}T00:00:00`):null; const to=dateTo?new Date(`${dateTo}T23:59:59.999`):null; return matchesSearch&&matchesStatus&&(!from||d>=from)&&(!to||d<=to)}),[orders,search,status,dateFrom,dateTo]);
 const delivered=filtered.filter(o=>o.status==="delivered").reduce((s,o)=>s+Number(o.total||0),0); const inWay=filtered.filter(o=>o.status==="shipping").length; const sales=filtered.reduce((s,o)=>s+Number(o.total||0),0);
 function clearFilters(){setSearch("");setStatus("all");setDateFrom("");setDateTo("");}
 async function exportToExcel(){
   if(!filtered.length||exporting)return; setExporting(true);
   (async()=>{
    try{
      const ids=filtered.map(o=>o.id);
      const {data:itemsData,error}=await createClient().from("order_items").select("order_id,product_name,quantity,unit_price,total_price").in("order_id",ids);
      if(error) throw error;
      const items=(itemsData||[]) as Item[];
      const rows:any[]=[];

      filtered.forEach(o=>{
        const orderItems=items.filter(i=>i.order_id===o.id);
        const base={
          "შეკვეთის №":o.order_number,
          "მომხმარებელი":o.customer_name,
          "ტელეფონი":o.customer_phone,
          "თანამშრომელი":o.profiles?.full_name||"",
          "შეკვეთის ჯამი (₾)":Number(o.total||0),
          "სტატუსი":labels[o.status],
          "თარიღი":new Date(o.created_at).toLocaleString("ka-GE")
        };

        if(orderItems.length===0){
          rows.push({...base,"პროდუქტი 1":"","პროდუქტი 2":"","პროდუქტი 3":"","პროდუქტი 4":"","პროდუქტი 5":""});
        } else if(orderItems.length<=5){
          const row:any={...base};
          for(let n=1;n<=5;n++) row[`პროდუქტი ${n}`]="";
          orderItems.forEach((i,index)=>{
            row[`პროდუქტი ${index+1}`]=`${i.product_name} (x${i.quantity})`;
          });
          rows.push(row);
        } else {
          // 5-ზე მეტი პროდუქტის შემთხვევაში თითო პროდუქტი ცალკე ზოლში.
          orderItems.forEach((i,index)=>rows.push({
            ...base,
            "პროდუქტის №":index+1,
            "პროდუქტი":i.product_name,
            "რაოდენობა":i.quantity,
            "ერთეულის ფასი (₾)":Number(i.unit_price||0),
            "პროდუქტის ჯამი (₾)":Number(i.total_price||0)
          }));
        }
      });

      const ws=XLSX.utils.json_to_sheet(rows);
      ws["!cols"]=orderItemsColumns(rows);
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"შეკვეთები");
      const safeFrom=dateFrom||"all",safeTo=dateTo||"all";
      XLSX.writeFile(wb,`orders_${safeFrom}_${safeTo}.xlsx`);
    }catch(e){console.error(e);alert("Excel-ის შექმნა ვერ მოხერხდა. სცადე თავიდან.");}finally{setExporting(false)}
   })();
 }

 function orderItemsColumns(rows:any[]){
   const hasLong=rows.some(r=>Object.prototype.hasOwnProperty.call(r,"პროდუქტი"));
   if(hasLong){
     return [{wch:14},{wch:25},{wch:18},{wch:24},{wch:16},{wch:30},{wch:12},{wch:18},{wch:20},{wch:20},{wch:22}];
   }
   return [{wch:14},{wch:25},{wch:18},{wch:24},{wch:18},{wch:30},{wch:30},{wch:30},{wch:30},{wch:30},{wch:20},{wch:22}];
 }
 return <>
  <div className="simple-head"><div><h1>Dashboard</h1><p>შეკვეთების მართვა</p></div><div className="head-actions"><button className="light-btn" onClick={load}>↻ განახლება</button><Link className="primary-btn" href="/orders/new">+ ახალი შეკვეთა</Link></div></div>
  <div className="simple-stats"><div className="stat"><span>სულ შეკვეთები</span><strong>{filtered.length}</strong></div><div className="stat"><span>გაყიდვები</span><strong>{sales.toFixed(2)} ₾</strong></div><div className="stat"><span>გზაშია</span><strong>{inWay}</strong></div><div className="stat"><span>ჩაბარებული</span><strong>{delivered.toFixed(2)} ₾</strong></div></div>
  <div className="simple-panel"><div className="panel-title"><div><h2>შეკვეთები</h2><span>{filtered.length} შედეგი</span></div></div>
   <div className="simple-filters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="მოძებნე №, სახელი ან ტელეფონი..."/><select value={status} onChange={e=>setStatus(e.target.value as "all"|Status)}><option value="all">ყველა სტატუსი</option>{(Object.keys(labels) as Status[]).map(s=><option key={s} value={s}>{labels[s]}</option>)}</select><label className="date-filter"><span>როდიდან</span><input type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)}/></label><label className="date-filter"><span>როდემდე</span><input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/></label><button className="excel-btn" onClick={exportToExcel} disabled={!filtered.length||exporting}>{exporting?"მზადდება...":"↓ Excel"}</button><button className="light-btn" onClick={clearFilters}>გასუფთავება</button></div>
   {loading?<div className="simple-empty">იტვირთება...</div>:filtered.length===0?<div className="simple-empty">შეკვეთები ვერ მოიძებნა.</div>:<div className="simple-table-wrap"><table className="simple-table"><thead><tr><th>№</th><th>მომხმარებელი</th><th>ტელეფონი</th><th>თანამშრომელი</th><th>ჯამი</th><th>სტატუსი</th><th>თარიღი</th><th></th></tr></thead><tbody>{filtered.map(o=><tr key={o.id}><td><b>#{o.order_number}</b></td><td>{o.customer_name}</td><td>{o.customer_phone}</td><td>{o.profiles?.full_name||"—"}</td><td><b>{Number(o.total).toFixed(2)} ₾</b></td><td><span className={`simple-badge ${o.status}`}>{labels[o.status]}</span></td><td>{new Date(o.created_at).toLocaleDateString("ka-GE")}</td><td><Link className="view-btn" href={`/orders/${o.id}`}>ნახვა</Link></td></tr>)}</tbody></table></div>}
  </div>
 </>
}
