"use client";
import {useEffect,useMemo,useState} from "react";import {useRouter} from "next/navigation";import {createClient} from "@/lib/supabase-browser";import {Product,ProductVariant} from "@/lib/types";
type Item={product:Product,variant:ProductVariant|null,quantity:number,price:number};
export default function NewOrder(){const [products,setProducts]=useState<Product[]>([]),[variants,setVariants]=useState<ProductVariant[]>([]),[items,setItems]=useState<Item[]>([]),[selected,setSelected]=useState(""),[selectedVariant,setSelectedVariant]=useState(""),[qty,setQty]=useState(1),[customer,setCustomer]=useState({name:"",phone:"",address:"",comment:""}),[delivery,setDelivery]=useState(""),[discount,setDiscount]=useState(""),[error,setError]=useState(""),[warning,setWarning]=useState(""),[checking,setChecking]=useState(false);const router=useRouter();
useEffect(()=>{const c=createClient();Promise.all([c.from("products").select("*").eq("active",true).order("name"),c.from("product_variants").select("*").eq("active",true).order("name")]).then(([p,v])=>{setProducts((p.data||[]) as Product[]);setVariants((v.data||[]) as ProductVariant[])})},[]);
const available=useMemo(()=>variants.filter(v=>v.product_id===selected),[variants,selected]);const subtotal=items.reduce((s,i)=>s+i.price*i.quantity,0),total=Math.max(0,subtotal+Number(delivery||0)-Number(discount||0));
function chooseProduct(id:string){setSelected(id);setSelectedVariant("")}
function add(){const p=products.find(x=>x.id===selected);if(!p)return;if(available.length&&!selectedVariant){setError("ამ პროდუქტისთვის აირჩიე ვარიანტი.");return}const v=available.find(x=>x.id===selectedVariant)||null,price=v?Number(v.price):Number(p.price),key=p.id+":"+(v?.id||"base");setItems(x=>{const old=x.find(i=>i.product.id+":"+(i.variant?.id||"base")===key);if(old)return x.map(i=>i.product.id+":"+(i.variant?.id||"base")===key?{...i,quantity:i.quantity+qty}:i);return[...x,{product:p,variant:v,quantity:qty,price}]});setSelected("");setSelectedVariant("");setQty(1);setError("")}
async function checkDuplicates(){
 const phone=customer.phone.trim(),address=customer.address.trim();
 if(!phone&&!address){setWarning("");return}
 setChecking(true);
 try{
  const c=createClient();
  const {data,error}=await c.rpc("check_order_duplicates",{p_phone:phone||null,p_address:address||null});
  if(error)throw error;
  const rows=(data||[]) as any[];
  if(!rows.length){setWarning("");return}
  const lines=rows.slice(0,5).map(r=>`${r.match_type==="phone"?"ტელეფონი":"მისამართი"} უკვე გვხვდება შეკვეთაში #${r.order_number} — ${new Date(r.created_at).toLocaleDateString("ka-GE")}`);
  setWarning("⚠️ "+lines.join("\n"));
 }catch(e:any){setWarning("დუბლიკატის შემოწმება ვერ მოხერხდა. შეკვეთის შექმნა მაინც შეგიძლია.");}
 finally{setChecking(false)}
}
async function save(){
 setError("");
 if(!customer.name.trim()||!items.length){setError("მიუთითე მომხმარებელი და მინიმუმ ერთი პროდუქტი.");return}
 try{
  const c=createClient(),{data:user,error:authError}=await c.auth.getUser();
  if(authError||!user.user){setError("სესია დასრულებულია. თავიდან შედი სისტემაში.");return}
  const {data:order,error:e}=await c.from("orders").insert({customer_name:customer.name.trim(),customer_phone:customer.phone.trim(),customer_address:customer.address.trim(),customer_comment:customer.comment.trim(),subtotal,delivery_fee:Number(delivery||0),discount:Number(discount||0),total,created_by:user.user.id,status:"current"}).select().single();
  if(e||!order){setError(e?.code==="23505"?"შეკვეთის ნომერი უკვე არსებობს. სცადე ხელახლა.":(e?.message||"შეკვეთა ვერ შეიქმნა."));return}
  const {error:ie}=await c.from("order_items").insert(items.map(i=>({order_id:order.id,product_id:i.product.id,product_name:i.product.name,variant_id:i.variant?.id||null,variant_name:i.variant?.name||null,quantity:i.quantity,unit_price:i.price})));
  if(ie){setError("შეკვეთა შეიქმნა, მაგრამ პროდუქტები ვერ დაემატა: "+ie.message);return}
  router.push(`/orders/${order.id}`)
 }catch(e:any){setError("შეკვეთა ვერ შეიქმნა. შეამოწმე ინტერნეტი და სცადე ხელახლა.");}
}
return <><div className="top"><div><div className="title">ახალი შეკვეთა</div></div></div>{error&&<div className="error">{error}</div>}{warning&&<div className="warning-box" style={{whiteSpace:"pre-line"}}>{warning}</div>}<div className="panel"><h3>მომხმარებელი</h3><div className="grid2"><div className="field"><label>სახელი და გვარი</label><input value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></div><div className="field"><label>ტელეფონი</label><input value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})} onBlur={checkDuplicates}/></div><div className="field"><label>მისამართი</label><input value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})} onBlur={checkDuplicates}/></div><div className="field"><label>კომენტარი</label><textarea value={customer.comment} onChange={e=>setCustomer({...customer,comment:e.target.value})}/></div></div></div>
<div className="panel"><h3>პროდუქტები</h3><div className="formline"><div className="field"><label>პროდუქტი</label><select value={selected} onChange={e=>chooseProduct(e.target.value)}><option value="">აირჩიე პროდუქტი</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>{selected&&available.length>0&&<div className="field"><label>ვარიანტი</label><select value={selectedVariant} onChange={e=>setSelectedVariant(e.target.value)}><option value="">აირჩიე ვარიანტი</option>{available.map(v=><option key={v.id} value={v.id}>{v.name} — {Number(v.price).toFixed(2)} ₾</option>)}</select></div>}<div className="field"><label>რაოდენობა</label><input type="number" min="1" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)))}/></div><button className="btn" onClick={add}>დამატება</button></div>
<table className="table"><thead><tr><th>პროდუქტი</th><th>ვარიანტი</th><th>რაოდენობა</th><th>ფასი</th><th>ჯამი</th><th></th></tr></thead><tbody>{items.map(i=>{const key=i.product.id+":"+(i.variant?.id||"base");return <tr key={key}><td>{i.product.name}</td><td>{i.variant?.name||"—"}</td><td>{i.quantity}</td><td>{i.price.toFixed(2)} ₾</td><td>{(i.price*i.quantity).toFixed(2)} ₾</td><td><button className="btn danger" onClick={()=>setItems(x=>x.filter(a=>a.product.id+":"+(a.variant?.id||"base")!==key))}>წაშლა</button></td></tr>})}</tbody></table></div>
<div className="panel"><div className="grid2"><div><div className="field"><label>მიტანის საფასური (₾)</label><input type="number" min="0" step="0.01" value={delivery} placeholder="0" onChange={e=>setDelivery(e.target.value)}/></div><div className="field"><label>ფასდაკლება (₾)</label><input type="number" min="0" step="0.01" value={discount} placeholder="0" onChange={e=>setDiscount(e.target.value)}/></div></div><div><p>პროდუქტები: <b>{subtotal.toFixed(2)} ₾</b></p><p>მიტანა: <b>{Number(delivery||0).toFixed(2)} ₾</b></p><p>ფასდაკლება: <b>{Number(discount||0).toFixed(2)} ₾</b></p><h2>სულ: {total.toFixed(2)} ₾</h2><button className="btn" onClick={save}>შეკვეთის შენახვა</button></div></div></div></>}
