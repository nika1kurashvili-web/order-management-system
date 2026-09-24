import {NextResponse} from "next/server";

export async function GET(){
  try{
    const url="https://onway.ge/index.php?route=api/order/regions";
    const r=await fetch(url,{method:"GET",cache:"no-store"});
    const text=await r.text();
    if(!r.ok)return NextResponse.json({error:`OnWay regions HTTP ${r.status}`},{status:502});

    let data:any;
    try{data=JSON.parse(text)}catch{
      return NextResponse.json({error:"OnWay-ის ქალაქების პასუხი JSON არ არის."},{status:502});
    }

    // OnWay returns: { zones: [{ zone_id, name }, ...] }
    const zones=Array.isArray(data?.zones)?data.zones:[];
    const regions=zones
      .map((z:any)=>({id:Number(z.zone_id),name:String(z.name||"").trim()}))
      .filter((z:any)=>Number.isFinite(z.id)&&z.name)
      .sort((a:any,b:any)=>a.name.localeCompare(b.name,"ka"));

    if(!regions.length)return NextResponse.json({error:"OnWay-დან ქალაქების სია ცარიელი დაბრუნდა."},{status:502});
    return NextResponse.json({regions});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"OnWay-ის ქალაქების სია ვერ ჩაიტვირთა."},{status:500});
  }
}
