 "use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase-browser";
export default function Products(){const [items,setItems]=useState<any[]>([]);const [name,setName]=useState("");const [price,setPrice]=useState(0);const [sku,setSku]=useState("");
async function load(){const {data}=await createClient().from("products").select("*").order("name");setItems(data||[])}useEffect(()=>{load()},[]);
async function add(){if(!name.trim())return;await createClient().from("products").insert({name,price:Number(price),sku:sku||null});setName("");setPrice(0);setSku("");load()}
return <><div className="top"><div className="title">პროდუქტები</div></div><div className="panel"><h3>პროდუქტის დამატება</h3><div className="formline"><div className="field"><label>დასახელება</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>ფასი</label><input type="number" value={price} onChange={e=>setPrice(Number(e.target.value))}/></div><div className="field"><label>კოდი</label><input value={sku} onChange={e=>setSku(e.target.value)}/></div><button className="btn" onClick={add}>დამატება</button></div></div><div className="panel"><table className="table"><thead><tr><th>დასახელება</th><th>კოდი</th><th>ფასი</th><th>მარაგი</th><th>სტატუსი</th></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.sku||"—"}</td><td>{p.price} ₾</td><td>{p.stock}</td><td>{p.active?"აქტიური":"არააქტიური"}</td></tr>)}</tbody></table></div></>
}
