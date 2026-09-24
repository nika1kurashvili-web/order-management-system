"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";
import {Product} from "@/lib/types";

type Item={product:Product,quantity:number};

export default function NewOrder(){
 const [products,setProducts]=useState<Product[]>([]);
 const [items,setItems]=useState<Item[]>([]);
 const [selected,setSelected]=useState("");
 const [qty,setQty]=useState(1);
 const [customer,setCustomer]=useState({name:"",phone:"",address:"",comment:""});
 const [delivery,setDelivery]=useState(0);
 const [discount,setDiscount]=useState(0);
 const [error,setError]=useState("");
 const router=useRouter();

 useEffect(()=>{createClient().from("products").select("*").eq("active",true).order("name").then(({data})=>setProducts((data||[]) as Product[]))},[]);
 const subtotal=items.reduce((s,i)=>s+i.product.price*i.quantity,0);
 const total=Math.max(0,subtotal+Number(delivery)-Number(discount));

 function add(){
   const p=products.find(x=>x.id===selected); if(!p)return;
   setItems(x=>{const old=x.find(i=>i.product.id===p.id);if(old)return x.map(i=>i.product.id===p.id?{...i,quantity:i.quantity+qty}:i);return [...x,{product:p,quantity:qty}]});
   setSelected("");
 }

 async function save(){
   setError("");
   if(!customer.name.trim()||items.length===0){setError("მიუთითე მომხმარებელი და მინიმუმ ერთი პროდუქტი.");return}
   const c=createClient();
   const {data:user}=await c.auth.getUser();
   if(!user.user){router.push("/login");return}
   const {data:profile}=await c.from("profiles").select("id").eq("id",user.user.id).single();
   const {data:order,error:e}=await c.from("orders").insert({
     customer_name:customer.name,customer_phone:customer.phone,customer_address:customer.address,
     customer_comment:customer.comment,subtotal,delivery_fee:Number(delivery),discount:Number(discount),
     total,created_by:profile?.id,status:"current"
   }).select().single();
   if(e||!order){setError(e?.message||"შეცდომა");return}
   const {error:itemError}=await c.from("order_items").insert(items.map(i=>({
     order_id:order.id,product_id:i.product.id,product_name:i.product.name,quantity:i.quantity,unit_price:i.product.price
   })));
   if(itemError){setError(itemError.message);return}
   router.push(`/orders/${order.id}`);
 }

 return <>
  <div className="top"><div><div className="title">ახალი შეკვეთა</div></div></div>
  {error&&<div className="error">{error}</div>}
  <div className="panel"><h3>მომხმარებელი</h3><div className="grid2">
   <div className="field"><label>სახელი და გვარი</label><input value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></div>
   <div className="field"><label>ტელეფონი</label><input value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></div>
   <div className="field"><label>მისამართი</label><input value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></div>
   <div className="field"><label>კომენტარი</label><textarea value={customer.comment} onChange={e=>setCustomer({...customer,comment:e.target.value})}/></div>
  </div></div>

  <div className="panel"><h3>პროდუქტები</h3>
   <div className="formline">
    <div className="field"><label>პროდუქტი</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">აირჩიე პროდუქტი</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.price} ₾</option>)}</select></div>
    <div className="field"><label>რაოდენობა</label><input type="number" min="1" value={qty} onChange={e=>setQty(Number(e.target.value))}/></div>
    <button className="btn" onClick={add}>დამატება</button>
   </div>
   <table className="table"><thead><tr><th>პროდუქტი</th><th>რაოდენობა</th><th>ფასი</th><th>ჯამი</th><th></th></tr></thead>
   <tbody>{items.map(i=><tr key={i.product.id}><td>{i.product.name}</td><td>{i.quantity}</td><td>{i.product.price} ₾</td><td>{(i.product.price*i.quantity).toFixed(2)} ₾</td><td><button className="btn danger" onClick={()=>setItems(x=>x.filter(a=>a.product.id!==i.product.id))}>წაშლა</button></td></tr>)}</tbody></table>
  </div>

  <div className="panel"><div className="grid2"><div>
   <div className="field"><label>მიტანის საფასური (₾)</label><input type="number" min="0" step="0.01" value={delivery} onChange={e=>setDelivery(Number(e.target.value))}/></div>
   <div className="field"><label>ფასდაკლება (₾)</label><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></div>
  </div><div>
   <p>პროდუქტები: <b>{subtotal.toFixed(2)} ₾</b></p>
   <p>მიტანის საფასური: <b>{Number(delivery).toFixed(2)} ₾</b></p>
   <p>ფასდაკლება: <b>{Number(discount).toFixed(2)} ₾</b></p>
   <h2>სულ: {total.toFixed(2)} ₾</h2>
   <button className="btn" onClick={save}>შეკვეთის შენახვა</button>
  </div></div></div>
 </>;
}
