import {NextResponse} from "next/server";

function collect(v:any,out:{id:number,name:string}[]){
  if(!v)return;
  if(Array.isArray(v)){for(const x of v)collect(x,out);return}
  if(typeof v!=="object")return;
  const id=v.id??v.region_id??v.city_id??v.regionId??v.cityId;
  const name=v.name??v.title??v.region_name??v.city_name??v.region??v.city;
  if(id!=null&&typeof name==="string"&&name.trim())out.push({id:Number(id),name:name.trim()});
  for(const x of Object.values(v))if(typeof x==="object")collect(x,out);
}
export async function GET(){
  try{
    const url="https://onway.ge/index.php?route=api/order/regions";
    let r=await fetch(url,{cache:"no-store"});
    let text=await r.text();
    if(!r.ok||!text.trim()){
      const username=process.env.ONWAY_API_USERNAME,key=process.env.ONWAY_API_KEY;
      r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,key}),cache:"no-store"});
      text=await r.text();
    }
    let data:any;try{data=JSON.parse(text)}catch{return NextResponse.json({error:"OnWay-ის ქალაქების პასუხი ვერ დამუშავდა."},{status:502})}
    const rows:{id:number,name:string}[]=[];collect(data,rows);
    const unique=[...new Map(rows.filter(x=>Number.isFinite(x.id)).map(x=>[x.id,x])).values()].sort((a,b)=>a.name.localeCompare(b.name,"ka"));
    if(!unique.length)return NextResponse.json({error:"OnWay-დან ქალაქების სია ცარიელი დაბრუნდა."},{status:502});
    return NextResponse.json({regions:unique});
  }catch(e:any){return NextResponse.json({error:e?.message||"OnWay-ის ქალაქების სია ვერ ჩაიტვირთა."},{status:500})}
}
