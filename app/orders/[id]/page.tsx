"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase-browser";
import {Status} from "@/lib/types";

const labels:Record<Status,string>={
 current:"მიმდინარე",
 shipping:"გზაში",
 delivered:"ჩაბარებული",
 cancelled:"გაუქმებული",
 return_pending:"უნდა დაბრუნდეს",
 returned:"დაბრუნდა",
 exchange:"გადასაცვლელია"
};

export default function OrderPage(){
 const params=useParams();
 const id=String(params.id);
 const [o,setO]=useState<any>(null);
 const [items,setItems]=useState<any[]>([]);
 const [status,setStatus]=useState<Status>("current");
 const [tracking,setTracking]=useState("");
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");

 async function load(){
   const c=createClient();
   const {data}=await c.from("orders").select("*,profiles(full_name)").eq("id",id).single();
   const {data:it}=await c.from("order_items").select("*").eq("order_id",id);
   setO(data);
   setStatus((data?.status||"current") as Status);
   setTracking(data?.tracking_code||"");
   setItems(it||[]);
 }

 useEffect(()=>{load()},[id]);

 async function saveChanges(){
   setSaving(true); setMessage("");
   const c=createClient();
   const {data:user}=await c.auth.getUser();
   const oldStatus=o?.status;
   const {error}=await c.from("orders").update({
     status,
     tracking_code:tracking.trim()||null
   }).eq("id",id);

   if(error){setMessage("შენახვა ვერ მოხერხდა: "+error.message);setSaving(false);return}

   if(oldStatus!==status){
     await c.from("order_status_history").insert({order_id:id,new_status:status,changed_by:user.user?.id});
   }

   await load();
   setMessage("ცვლილებები შენახულია.");
   setSaving(false);
 }

 if(!o)return <p>იტვირთება...</p>;

 return <>
  <div className="top">
   <div><div className="title">შეკვეთა #{o.order_number}</div><div className="muted">{new Date(o.created_at).toLocaleString("ka-GE")}</div></div>
   <Link className="btn secondary" href="/dashboard">← უკან</Link>
  </div>

  {message&&<div className={message.startsWith("შენახვა ვერ")?"error":"success-box"}>{message}</div>}

  <div className="grid2">
   <div className="panel"><h3>მომხმარებელი</h3>
    <p><b>{o.customer_name}</b></p><p>{o.customer_phone}</p><p>{o.customer_address}</p><p>{o.customer_comment}</p>
    <p>გააფორმა: <b>{o.profiles?.full_name||"—"}</b></p>
   </div>

   <div className="panel"><h3>შეკვეთის მართვა</h3>
    <div className="field"><label>სტატუსი</label><select value={status} onChange={e=>setStatus(e.target.value as Status)}>
     {(Object.keys(labels) as Status[]).map(k=><option key={k} value={k}>{labels[k]}</option>)}
    </select></div>
    <div className="field"><label>თრექინგ კოდი</label><input value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="მაგ: GE123456789"/></div>
    <button className="btn" onClick={saveChanges} disabled={saving}>{saving?"ინახება...":"ცვლილებების შენახვა"}</button>
   </div>
  </div>

  <div className="panel"><h3>პროდუქტები</h3>
   <table className="table"><thead><tr><th>პროდუქტი</th><th>რაოდენობა</th><th>ერთეულის ფასი</th><th>ჯამი</th></tr></thead>
   <tbody>{items.map(i=><tr key={i.id}><td>{i.product_name}</td><td>{i.quantity}</td><td>{i.unit_price} ₾</td><td>{i.total_price} ₾</td></tr>)}</tbody></table>
   <hr/>
   <p>პროდუქტები: <b>{Number(o.subtotal||0).toFixed(2)} ₾</b></p>
   <p>მიტანის საფასური: <b>{Number(o.delivery_fee||0).toFixed(2)} ₾</b></p>
   <p>ფასდაკლება: <b>{Number(o.discount||0).toFixed(2)} ₾</b></p>
   <h2>სულ: {Number(o.total||0).toFixed(2)} ₾</h2>
  </div>
 </>;
}
