"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Status } from "@/lib/types";
import * as XLSX from "xlsx";

const labels: Record<Status,string> = {
  current:"მიმდინარე", shipping:"გზაში", delivered:"ჩაბარებული",
  cancelled:"გაუქმებული", return_pending:"უნდა დაბრუნდეს",
  returned:"დაბრუნდა", exchange:"გადასაცვლელია"
};
const statuses = Object.keys(labels) as Status[];
type Order={id:string;order_number:number;customer_name:string;customer_phone:string;total:number;delivery_fee:number;discount:number;payment_type?:string|null;tracking_code:string|null;status:Status;created_at:string;created_by?:string;profiles?:{full_name:string|null}|null};
type Item={order_id:string;product_name:string;variant_name?:string|null;quantity:number;unit_price:number;total_price:number};

export default function Dashboard(){
 const [orders,setOrders]=useState<Order[]>([]),[items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState<string|null>(null),[sendingOnway,setSendingOnway]=useState<string|null>(null);
 const [search,setSearch]=useState(""),[product,setProduct]=useState("all"),[status,setStatus]=useState<"all"|Status>("all"),[employee,setEmployee]=useState("all");
 const [dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState(""),[sort,setSort]=useState<"new"|"old">("new");
 const [page,setPage]=useState(1),[exporting,setExporting]=useState(false),[role,setRole]=useState<"admin"|"operator">("operator"); const pageSize=50;

 async function load(){setLoading(true);try{const c=createClient();const {data:{user}}=await c.auth.getUser();if(!user){location.href="/login";return}const {data:profile}=await c.from("profiles").select("role").eq("id",user.id).single();setRole(profile?.role==="admin"?"admin":"operator");const {data,error}=await c.from("orders").select("*,profiles(full_name)").order("created_at",{ascending:false}).limit(5000);if(error)throw error;const os=(data||[]) as Order[];setOrders(os);if(os.length){const {data:itemData,error:itemError}=await c.from("order_items").select("order_id,product_name,variant_name,quantity,unit_price,total_price").in("order_id",os.map(o=>o.id));if(itemError)throw itemError;setItems((itemData||[]) as Item[])}else setItems([])}catch(e){alert("შეკვეთების ჩატვირთვა ვერ მოხერხდა. შეამოწმე ინტერნეტი და სცადე ხელახლა.")}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{setPage(1)},[search,product,status,employee,dateFrom,dateTo,sort]);

 const employees=useMemo(()=>Array.from(new Set(orders.map(o=>o.profiles?.full_name).filter(Boolean) as string[])).sort(),[orders]);
 const products=useMemo(()=>Array.from(new Set(items.map(i=>i.product_name).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ka")),[items]);
 const itemsByOrder=useMemo(()=>{const m:Record<string,Item[]>={};items.forEach(i=>(m[i.order_id]??=[]).push(i));return m},[items]);
 const filtered=useMemo(()=>orders.filter(o=>{const q=search.trim().toLowerCase(),d=new Date(o.created_at),f=dateFrom?new Date(dateFrom+"T00:00:00"):null,t=dateTo?new Date(dateTo+"T23:59:59.999"):null;
  const oi=itemsByOrder[o.id]||[];
  return(!q||String(o.order_number).includes(q)||(o.customer_name||"").toLowerCase().includes(q)||(o.customer_phone||"").toLowerCase().includes(q)||(o.tracking_code||"").toLowerCase().includes(q)||(o.profiles?.full_name||"").toLowerCase().includes(q)||oi.some(i=>(i.product_name||"").toLowerCase().includes(q)||(i.variant_name||"").toLowerCase().includes(q)))
  &&(product==="all"||oi.some(i=>i.product_name===product))
  &&(status==="all"||o.status===status)&&(employee==="all"||o.profiles?.full_name===employee)&&(!f||d>=f)&&(!t||d<=t)
 }).sort((a,b)=>sort==="new"?+new Date(b.created_at)-+new Date(a.created_at):+new Date(a.created_at)-+new Date(b.created_at)),[orders,itemsByOrder,search,product,status,employee,dateFrom,dateTo,sort]);
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize)), visible=filtered.slice((page-1)*pageSize,page*pageSize);
 const sales=filtered.reduce((s,o)=>s+Number(o.total||0),0),delivered=filtered.filter(o=>o.status==="delivered").reduce((s,o)=>s+Number(o.total||0),0),inWay=filtered.filter(o=>o.status==="shipping").length;

 async function quickSave(o:Order,patch:Partial<Order>){setSaving(o.id);try{const {error}=await createClient().from("orders").update(patch).eq("id",o.id);if(error)throw error;setOrders(x=>x.map(a=>a.id===o.id?{...a,...patch}:a))}catch(e:any){alert("ცვლილება ვერ შეინახა: "+(e?.message||"შეამოწმე ინტერნეტი."));await load()}finally{setSaving(null)}}
 async function sendOnway(o:Order){
  if(sendingOnway)return;
  if(o.tracking_code){alert(`შეკვეთა #${o.order_number} უკვე გაგზავნილია OnWay-ში. თრექინგი: ${o.tracking_code}`);return}
  if(!confirm(`გავაგზავნოთ შეკვეთა #${o.order_number} OnWay-ში?`))return;
  setSendingOnway(o.id);
  try{
    const res=await fetch("/api/onway/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:o.id})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const details=typeof data.details==="string"?data.details:JSON.stringify(data.details||"");throw new Error((data.error||"OnWay-ში გაგზავნა ვერ მოხერხდა.")+(details?` — ${details}`:""))}
    alert(`შეკვეთა #${o.order_number} წარმატებით გაიგზავნა OnWay-ში.`);
    await load();
  }catch(e:any){alert(e?.message||"OnWay-ში გაგზავნა ვერ მოხერხდა.")}finally{setSendingOnway(null)}
 }
 async function exportProductsExcel(){
  if(role!=="admin"){alert("Excel-ის ჩამოტვირთვა მხოლოდ Admin-ს შეუძლია.");return}
  if(!filtered.length||exporting)return;setExporting(true);
  try{
   const ids=filtered.map(o=>o.id);
   const {data,error}=await createClient().from("order_items").select("order_id,product_name,variant_name,quantity,unit_price,total_price").in("order_id",ids);
   if(error)throw error;
   const grouped=new Map<string,{product_name:string;variant_name:string;unit_price:number;quantity:number;total:number}>();
   ((data||[]) as Item[]).forEach(i=>{
    const price=Number(i.unit_price||0),qty=Number(i.quantity||0);
    const lineTotal=Number(i.total_price ?? price*qty);
    // Price is part of the key intentionally: if the same product was sold at an edited/different price,
    // it appears on a separate row so the report preserves the actual sold price.
    const key=[i.product_name||"",i.variant_name||"",price].join("|||");
    const cur=grouped.get(key);
    if(cur){cur.quantity+=qty;cur.total+=lineTotal}
    else grouped.set(key,{product_name:i.product_name||"",variant_name:i.variant_name||"",unit_price:price,quantity:qty,total:lineTotal});
   });
   const rows=Array.from(grouped.values()).sort((a,b)=>a.product_name.localeCompare(b.product_name,"ka")||a.variant_name.localeCompare(b.variant_name,"ka")||a.unit_price-b.unit_price).map(x=>({
    "პროდუქტი":x.product_name,
    "ვარიანტი":x.variant_name,
    "ერთეულის ფასი (₾)":x.unit_price,
    "რაოდენობა":x.quantity,
    "ჯამი (₾)":Number(x.total.toFixed(2))
   }));
   const XLSX=await import("xlsx");
   const ws=XLSX.utils.json_to_sheet(rows);
   ws["!cols"]=[{wch:32},{wch:24},{wch:18},{wch:12},{wch:16}];
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"პროდუქტები");
   XLSX.writeFile(wb,`products-summary-${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e:any){alert("პროდუქტების Excel ვერ შეიქმნა: "+(e?.message||"უცნობი შეცდომა"))}finally{setExporting(false)}
 }
 async function copy(v:string){if(!v)return;await navigator.clipboard.writeText(v)}
 function clearFilters(){setSearch("");setProduct("all");setStatus("all");setEmployee("all");setDateFrom("");setDateTo("");setSort("new")}
 async function exportExcel(){
  if(role!=="admin"){alert("Excel-ის ჩამოტვირთვა მხოლოდ Admin-ს შეუძლია.");return}
  if(!filtered.length||exporting)return;setExporting(true);
  try{const ids=filtered.map(o=>o.id),{data,error}=await createClient().from("order_items").select("order_id,product_name,variant_name,quantity,unit_price,total_price").in("order_id",ids);if(error)throw error;const items=(data||[]) as Item[],rows:any[]=[];
   filtered.forEach(o=>{const oi=items.filter(i=>i.order_id===o.id),base={"შეკვეთის №":o.order_number,"მომხმარებელი":o.customer_name,"ტელეფონი":o.customer_phone,"თრექინგ კოდი":o.tracking_code||"","თანამშრომელი":o.profiles?.full_name||"","გადახდის მეთოდი":o.payment_type==="cod"?"კურიერთან":o.payment_type==="prepaid"?"წინასწარ":"","მიტანის საფასური (₾)":Number(o.delivery_fee||0),"ფასდაკლება (₾)":Number(o.discount||0),"შეკვეთის ჯამი (₾)":Number(o.total||0),"სტატუსი":labels[o.status],"თარიღი":new Date(o.created_at).toLocaleString("ka-GE")};
    if(oi.length<=5){const r:any={...base};for(let n=1;n<=5;n++)r[`პროდუქტი ${n}`]="";oi.forEach((i,n)=>r[`პროდუქტი ${n+1}`]=`${i.product_name}${i.variant_name?` — ${i.variant_name}`:""} (x${i.quantity}, ${Number(i.unit_price).toFixed(2)} ₾)`);rows.push(r)}
    else oi.forEach((i,n)=>rows.push({...base,"პროდუქტის №":n+1,"პროდუქტი":i.product_name,"ვარიანტი":i.variant_name||"","რაოდენობა":i.quantity,"ერთეულის ფასი (₾)":Number(i.unit_price),"პროდუქტის ჯამი (₾)":Number(i.total_price||0)}))
   });
   const ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=Array.from({length:16},()=>({wch:22}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"შეკვეთები");XLSX.writeFile(wb,`orders_${dateFrom||"all"}_${dateTo||"all"}.xlsx`)
  }catch(e){console.error(e);alert("Excel-ის შექმნა ვერ მოხერხდა.")}finally{setExporting(false)}
 }
 return <><div className="simple-head"><div><h1>Dashboard</h1><p>შეკვეთების სწრაფი მართვა</p></div><div className="head-actions"><button className="light-btn" onClick={load}>↻ განახლება</button><Link className="primary-btn" href="/orders/new">+ ახალი შეკვეთა</Link></div></div>
 <div className="simple-stats"><div className="stat"><span>სულ შეკვეთები</span><strong>{filtered.length}</strong></div>{role==="admin"&&<div className="stat"><span>გაყიდვები</span><strong>{sales.toFixed(2)} ₾</strong></div>}<div className="stat"><span>გზაში</span><strong>{inWay}</strong></div>{role==="admin"&&<div className="stat"><span>ჩაბარებული</span><strong>{delivered.toFixed(2)} ₾</strong></div>}</div>
 <div className="status-chips"><button className={status==="all"?"active":""} onClick={()=>setStatus("all")}>ყველა</button>{statuses.map(s=><button key={s} className={status===s?"active":""} onClick={()=>setStatus(s)}>{labels[s]} <b>{orders.filter(o=>o.status===s).length}</b></button>)}</div>
 <div className="simple-panel"><div className="panel-title"><div><h2>შეკვეთები</h2><span>{filtered.length} შედეგი · გვერდი {page}/{pages}</span></div></div>
 <div className="quick-filters">
  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="№, სახელი, ტელეფონი, თრექინგი ან პროდუქტი..."/>
  <select value={product} onChange={e=>setProduct(e.target.value)}><option value="all">ყველა პროდუქტი</option>{products.map(p=><option key={p} value={p}>{p}</option>)}</select>
  {role==="admin"&&<select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="all">ყველა თანამშრომელი</option>{employees.map(e=><option key={e}>{e}</option>)}</select>}
  <label><span>როდიდან</span><input type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)}/></label>
  <label><span>როდემდე</span><input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/></label>
  <select value={sort} onChange={e=>setSort(e.target.value as any)}><option value="new">ახალი → ძველი</option><option value="old">ძველი → ახალი</option></select>
  {role==="admin"&&<button className="excel-btn" onClick={exportExcel} disabled={!filtered.length||exporting}>{exporting?"მზადდება...":"↓ Excel"}</button>}{role==="admin"&&<button className="excel-btn" onClick={exportProductsExcel} disabled={!filtered.length||exporting} style={{width:"auto",minWidth:170,padding:"8px 14px",whiteSpace:"nowrap",flex:"0 0 auto"}}>{exporting?"მზადდება...":"↓ პროდუქტების Excel"}</button>}<button className="light-btn" onClick={clearFilters}>გასუფთავება</button>
 </div>
 {loading?<div className="simple-empty">იტვირთება...</div>:!visible.length?<div className="simple-empty">შეკვეთები ვერ მოიძებნა.</div>:<div className="simple-table-wrap"><table className="simple-table fast-table"><thead><tr><th>№</th><th>მომხმარებელი</th><th>ტელეფონი</th><th>პროდუქტები</th><th>თრექინგი</th><th>თანამშრომელი</th><th>გადახდა</th><th>ჯამი</th><th>სტატუსი</th><th>თარიღი</th><th></th></tr></thead><tbody>{visible.map(o=><tr key={o.id}><td><b>#{o.order_number}</b></td><td>{o.customer_name}</td><td><button className="copy-cell" title="კოპირება" onClick={()=>copy(o.customer_phone)}>{o.customer_phone}</button></td><td><div style={{display:"flex",flexWrap:"wrap",gap:6,minWidth:180,maxWidth:340}}>{(itemsByOrder[o.id]||[]).map((i,n)=><span key={n} title={`${i.product_name}${i.variant_name?` — ${i.variant_name}`:""} ×${i.quantity}`} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 8px",borderRadius:999,background:"#f2f4f7",border:"1px solid #e3e7ed",fontSize:12,fontWeight:600}}>{i.product_name}{i.variant_name?<small style={{fontWeight:500,opacity:.7}}> · {i.variant_name}</small>:null}<b>×{i.quantity}</b></span>)}{!(itemsByOrder[o.id]||[]).length&&<span style={{opacity:.5}}>—</span>}</div></td><td><input className="tracking-inline" defaultValue={o.tracking_code||""} placeholder="თრექინგი" onBlur={e=>{const v=e.target.value.trim();if(v!==(o.tracking_code||""))quickSave(o,{tracking_code:v||null})}}/></td><td>{o.profiles?.full_name||"—"}</td><td><span style={{display:"inline-block",padding:"5px 8px",borderRadius:999,background:"#f2f4f7",border:"1px solid #e3e7ed",fontSize:12,fontWeight:700}}>{o.payment_type==="cod"?"კურიერთან":o.payment_type==="prepaid"?"წინასწარ":"—"}</span></td><td><b>{Number(o.total).toFixed(2)} ₾</b></td><td><select className={`status-inline ${o.status}`} value={o.status} disabled={saving===o.id} onChange={e=>quickSave(o,{status:e.target.value as Status})}>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></td><td>{new Date(o.created_at).toLocaleDateString("ka-GE")}</td><td><div style={{display:"flex",gap:6,alignItems:"center",whiteSpace:"nowrap"}}><button type="button" className="light-btn" disabled={sendingOnway===o.id||!!o.tracking_code} onClick={()=>sendOnway(o)} title={o.tracking_code?`OnWay-ში უკვე გაგზავნილია · ${o.tracking_code}`:"OnWay-ში გაგზავნა"} style={{padding:"7px 9px",fontSize:12,opacity:o.tracking_code?.7:1,cursor:o.tracking_code?"not-allowed":"pointer"}}>{sendingOnway===o.id?"იგზავნება...":o.tracking_code?"✓ გაგზავნილია":"OnWay"}</button><Link className="view-btn" href={`/orders/${o.id}`}>ნახვა</Link></div></td></tr>)}</tbody></table></div>}
 <div className="pager"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← წინა</button><span>{page} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>შემდეგი →</button></div>
 </div></>
}