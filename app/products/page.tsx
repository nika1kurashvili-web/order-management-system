"use client";
import ExcelImport from "./ExcelImport";
import PurchasePriceField from "./PurchasePriceField";
import {parsePurchasePrice, readPurchasePrices, PurchasePrice} from "@/lib/purchase-prices";
import {useEffect,useMemo,useRef,useState} from "react";import {createClient} from "@/lib/supabase-browser";
export default function Products(){const [items,setItems]=useState<any[]>([]),[variants,setVariants]=useState<any[]>([]),[role,setRole]=useState("operator");const [name,setName]=useState(""),[price,setPrice]=useState(0),[sku,setSku]=useState(""),[weight,setWeight]=useState("1"),[search,setSearch]=useState("");const [open,setOpen]=useState<string|null>(null),[vname,setVname]=useState(""),[vprice,setVprice]=useState(0),[vsku,setVsku]=useState(""),[vweight,setVweight]=useState("");const [message,setMessage]=useState("");
const [purchasePrice,setPurchasePrice]=useState(""),[variantPurchasePrice,setVariantPurchasePrice]=useState(""),[costs,setCosts]=useState<PurchasePrice[]>([]),[costsReady,setCostsReady]=useState(false);
const costOf=(id:string,kind:"product"|"variant")=>{const value=costs.find(c=>kind==="product"?c.product_id===id:c.variant_id===id)?.purchase_price;return value==null?null:Number(value)};
const [deletingKey,setDeletingKey]=useState<string|null>(null),[deleteError,setDeleteError]=useState("");
const deletingRef=useRef(false);
const [pendingDeletion,setPendingDeletion]=useState<{id:string;name:string;kind:"product"|"variant"}|null>(null);
const deleteDialog=useRef<HTMLDialogElement>(null);
useEffect(()=>{
 const dialog=deleteDialog.current;if(!dialog)return;
 if(pendingDeletion&&role==="admin"){if(!dialog.open)dialog.showModal()}
 else if(dialog.open)dialog.close();
},[pendingDeletion,role]);
const filteredItems=useMemo(()=>{const q=search.trim().toLowerCase();return !q?items:items.filter(p=>(p.name||"").toLowerCase().includes(q));},[items,search]);
async function load(){const c=createClient();setCosts([]);setCostsReady(false);const {data:u}=await c.auth.getUser();if(!u.user){setRole("");return}const {data:p}=await c.from("profiles").select("role,active").eq("id",u.user.id).single();const currentRole=p?.active===true?p.role:"";setRole(currentRole);const [{data,error},{data:v,error:ve}]=await Promise.all([c.from("products").select("*").order("name"),c.from("product_variants").select("*").order("name")]);if(error||ve)setMessage("პროდუქტების ჩატვირთვა ვერ მოხერხდა.");setItems(data||[]);setVariants(v||[]);if(currentRole==="admin"){try{setCosts(await readPurchasePrices(c));setCostsReady(true)}catch(e){setMessage(e instanceof Error?e.message:"შესყიდვის ფასები ვერ ჩაიტვირთა.")}}}useEffect(()=>{load()},[]);
async function add(){if(role!=="admin"||!name.trim())return;const w=Number(weight);if(!w||w<=0){setMessage("მიუთითე პროდუქტის წონა.");return}let cost:number|null;try{cost=parsePurchasePrice(purchasePrice)}catch(e){setMessage((e as Error).message);return}const {error}=await createClient().rpc("nexo_create_catalog_item",{p_kind:"product",p_item:{name:name.trim(),price:Number(price),sku:sku||null,weight_kg:w},p_purchase_price:cost});if(error){setMessage("პროდუქტი ვერ დაემატა: "+error.message);return}setName("");setPurchasePrice("");setPrice(0);setSku("");setWeight("1");setMessage("პროდუქტი დაემატა.");load()}
async function updateProduct(p:any,patch:any){if(role!=="admin")return;const {error}=await createClient().from("products").update(patch).eq("id",p.id);if(error){setMessage("ცვლილება ვერ შეინახა: "+error.message);return}load()}
async function addVariant(product:any){if(role!=="admin"||!vname.trim())return;let cost:number|null;try{cost=parsePurchasePrice(variantPurchasePrice)}catch(e){setMessage((e as Error).message);return}const {error}=await createClient().rpc("nexo_create_catalog_item",{p_kind:"variant",p_item:{product_id:product.id,name:vname.trim(),price:Number(vprice),sku:vsku||null,weight_kg:vweight===""?null:Number(vweight)},p_purchase_price:cost});if(error){setMessage("ვარიანტი ვერ დაემატა: "+error.message);return}setVname("");setVariantPurchasePrice("");setVprice(Number(product.price));setVsku("");setVweight("");load()}
async function toggleVariant(v:any){const {error}=await createClient().from("product_variants").update({active:!v.active}).eq("id",v.id);if(error)setMessage("ცვლილება ვერ შეინახა: "+error.message);else load()}
async function permanentlyDelete(){
 if(deletingRef.current)return;
 if(role!=="admin"){setDeleteError("წაშლა მხოლოდ Admin-ს შეუძლია.");return}
 if(!pendingDeletion)return;
 const item=pendingDeletion,kind=item.kind;
 deletingRef.current=true;
 setPendingDeletion(null);
 try{
  setDeletingKey(`${kind}:${item.id}`);setDeleteError("");setMessage("");
  const c=createClient();
  const {data:auth,error:authError}=await c.auth.getUser();
  if(authError||!auth.user)throw new Error("სესია დასრულებულია. თავიდან შედით სისტემაში.");
  const {data:profile,error:profileError}=await c.from("profiles").select("role,active").eq("id",auth.user.id).single();
  if(profileError||profile?.role!=="admin"||profile.active===false)throw new Error("წაშლა მხოლოდ აქტიურ Admin-ს შეუძლია.");
  // Verified live FKs cascade product deletion to variants and SET NULL on
  // order_items references. Delete only the target; retain historical snapshots.
  const table=kind==="product"?"products":"product_variants";
  const {data:deleted,error}=await c.from(table).delete().eq("id",item.id).select("id").single();
  if(error)throw new Error(error.code==="23503"?"ჩანაწერი სხვა მონაცემებთან არის დაკავშირებული; მონაცემთა ბაზა წაშლას ბლოკავს. "+error.message:error.message);
  if(!deleted||deleted.id!==item.id)throw new Error("წაშლა ვერ დადასტურდა. ჩანაწერი აღარ არსებობს ან წვდომა შეზღუდულია.");
  if(kind==="product"){
   setItems(current=>current.filter(product=>product.id!==item.id));
   setVariants(current=>current.filter(variant=>variant.product_id!==item.id));
   setOpen(current=>current===item.id?null:current);
  }else setVariants(current=>current.filter(variant=>variant.id!==item.id));
  setMessage(`${kind==="product"?"პროდუქტი":"ვარიანტი"} „${item.name}“ სამუდამოდ წაიშალა. შეკვეთების ისტორია შენარჩუნებულია.`);
  try{await load()}catch{setDeleteError("წაშლა შესრულდა, მაგრამ სია ვერ განახლდა. განაახლეთ გვერდი.")}
 }catch(error){setDeleteError("წაშლა ვერ შესრულდა: "+(error instanceof Error?error.message:"უცნობი შეცდომა."))}
 finally{deletingRef.current=false;setDeletingKey(null)}
}
function requestDeletion(item:any,kind:"product"|"variant"){
 if(deletingRef.current||pendingDeletion)return;
 if(role!=="admin"){setDeleteError("წაშლა მხოლოდ Admin-ს შეუძლია.");return}
 setPendingDeletion({id:item.id,name:item.name,kind});
}
function deleteProduct(p:any){requestDeletion(p,"product")}
function deleteVariant(v:any){requestDeletion(v,"variant")}
return <>{role==="admin"&&<dialog ref={deleteDialog} aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={event=>{event.preventDefault();setPendingDeletion(null)}} style={{border:0,borderRadius:12,padding:24,maxWidth:480,width:"calc(100% - 32px)"}}>
<h3 id="delete-title">სამუდამო წაშლა</h3>
<p id="delete-description">ნამდვილად გსურთ {pendingDeletion?.kind==="product"?"პროდუქტის":"ვარიანტის"} „{pendingDeletion?.name}“ სამუდამოდ წაშლა? ეს მოქმედება ვერ გაუქმდება.{pendingDeletion?.kind==="product"&&" პროდუქტის ყველა ვარიანტიც სამუდამოდ წაიშლება."}</p>
<div style={{display:"flex",gap:12,justifyContent:"flex-end"}}><button type="button" className="btn secondary" autoFocus onClick={()=>setPendingDeletion(null)}>გაუქმება</button><button type="button" className="btn danger" disabled={deletingKey!==null||!pendingDeletion} onClick={permanentlyDelete}>წაშლა</button></div>
</dialog>}<div className="top"><div><div className="title">პროდუქტები</div><div className="muted">წონა გამოიყენება OnWay-ში გაგზავნისას</div></div></div>{message&&<div className="success-box" role="status">{message}</div>}{deleteError&&<div className="error" role="alert">{deleteError}</div>}{role==="admin"&&<ExcelImport onImported={load}/>}{role==="admin"&&<div className="panel"><h3>პროდუქტის დამატება</h3><div className="formline"><div className="field"><label>დასახელება</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>ფასი</label><input type="number" value={price} onChange={e=>setPrice(Number(e.target.value))}/></div><div className="field"><label>შესყიდვის ფასი (₾)</label><input type="number" min="0" step="0.01" value={purchasePrice} onChange={e=>setPurchasePrice(e.target.value)} placeholder="არ არის მითითებული"/></div><div className="field"><label>კოდი</label><input value={sku} onChange={e=>setSku(e.target.value)}/></div><div className="field"><label>წონა (კგ)</label><input type="number" min="0.01" step="0.01" value={weight} onChange={e=>setWeight(e.target.value)}/></div><button className="btn" onClick={add}>დამატება</button></div></div>}
<div className="panel"><div className="field" style={{marginBottom:12}}><label>პროდუქტის ძებნა</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ჩაწერე პროდუქტის სახელი..."/></div><table className="table"><thead><tr><th>დასახელება / ვარიანტები</th><th>პროდუქტის კოდი</th><th>ფასი</th>{role==="admin"&&<th>შესყიდვის ფასი</th>}<th>წონა</th><th>ვარიანტები</th><th>სტატუსი</th>{role==="admin"&&<th></th>}</tr></thead><tbody>{filteredItems.map(p=>{const vs=variants.filter(v=>v.product_id===p.id);return <><tr key={p.id}><td><b>{p.name}</b>{vs.length>0&&<ul style={{listStyle:"none",padding:0,margin:"8px 0 0",overflowWrap:"anywhere"}}>{vs.map(v=><li key={v.id}><b>{v.name}</b> — კოდი: <span>{v.sku??"—"}</span> — {Number(v.price).toFixed(2)} ₾ — {Number(v.weight_kg??p.weight_kg??0).toFixed(2)} კგ{role==="admin"&&costsReady&&<span> · შესყიდვის ფასი: {costOf(v.id,"variant")===null?"—":costOf(v.id,"variant")!.toFixed(2)+" ₾"}</span>}{!v.active&&" · არააქტიური"}</li>)}</ul>}</td><td>{p.sku||"—"}</td><td>{Number(p.price).toFixed(2)} ₾</td>{role==="admin"&&<td>{costsReady?<PurchasePriceField id={p.id} kind="product" value={costOf(p.id,"product")} onSaved={load}/>:"შესყიდვის ფასი მიუწვდომელია"}</td>}<td>{role==="admin"?<input className="mini-input" type="number" min="0.01" step="0.01" value={p.weight_kg??1} onChange={e=>setItems(x=>x.map(a=>a.id===p.id?{...a,weight_kg:e.target.value}:a))} onBlur={()=>updateProduct(p,{weight_kg:Number(p.weight_kg)||1})}/>:Number(p.weight_kg||1).toFixed(2)+" კგ"}</td><td>{vs.length?<button className="variant-count" onClick={()=>setOpen(open===p.id?null:p.id)}>{vs.length} ვარიანტი</button>:role==="admin"?<button className="variant-count" onClick={()=>{setOpen(p.id);setVprice(Number(p.price))}}>+ ვარიანტი</button>:"—"}</td><td>{p.active?"აქტიური":"არააქტიური"}</td>{role==="admin"&&<td><button className="btn secondary" disabled={deletingKey!==null} onClick={()=>updateProduct(p,{active:!p.active})}>{p.active?"გახადე არააქტიური":"გააქტიურე"}</button> <button className="btn danger" disabled={deletingKey!==null} title="პროდუქტის სამუდამოდ წაშლა" onClick={()=>deleteProduct(p)}>{deletingKey===`product:${p.id}`?"მუშავდება...":"წაშლა"}</button></td>}</tr>{open===p.id&&<tr key={p.id+"-variants"}><td colSpan={role==="admin"?8:6}><div className="variant-box"><h4>{p.name} — ვარიანტები</h4>{vs.map(v=><div className="variant-row" key={v.id}><span><b>{v.name}</b> · კოდი: {v.sku??"—"}</span><span>{Number(v.price).toFixed(2)} ₾</span><span>{v.weight_kg!=null?`${Number(v.weight_kg).toFixed(2)} კგ`:"საბაზისო წონა"}</span><span>{v.active?"აქტიური":"არააქტიური"}</span>{role==="admin"&&costsReady&&<PurchasePriceField id={v.id} kind="variant" value={costOf(v.id,"variant")} onSaved={load}/>} {role==="admin"&&<span><button className="btn secondary" disabled={deletingKey!==null} onClick={()=>toggleVariant(v)}>{v.active?"გამორთვა":"ჩართვა"}</button> <button className="btn danger" disabled={deletingKey!==null} title="ვარიანტის სამუდამოდ წაშლა" onClick={()=>deleteVariant(v)}>{deletingKey===`variant:${v.id}`?"მუშავდება...":"წაშლა"}</button></span>}</div>)}{role==="admin"&&<div className="variant-add"><input placeholder="მაგ. Honda" value={vname} onChange={e=>setVname(e.target.value)}/><input placeholder="კოდი" value={vsku} onChange={e=>setVsku(e.target.value)}/><input type="number" placeholder="ფასი" value={vprice} onChange={e=>setVprice(Number(e.target.value))}/><label>შესყიდვის ფასი (₾)<input type="number" min="0" step="0.01" placeholder="არ არის მითითებული" value={variantPurchasePrice} onChange={e=>setVariantPurchasePrice(e.target.value)}/></label><input type="number" min="0.01" step="0.01" placeholder="წონა (ცარიელი = საბაზისო)" value={vweight} onChange={e=>setVweight(e.target.value)}/><button className="btn" onClick={()=>addVariant(p)}>ვარიანტის დამატება</button></div>}</div></td></tr>}</>})}</tbody></table></div></>}
