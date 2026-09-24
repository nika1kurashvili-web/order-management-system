import {NextResponse} from "next/server";

function sanitize(text:string){
  const user=process.env.ONWAY_API_USERNAME||"";
  const key=process.env.ONWAY_API_KEY||"";
  let s=text;
  if(user)s=s.split(user).join("[REDACTED_USERNAME]");
  if(key)s=s.split(key).join("[REDACTED_KEY]");
  return s.slice(0,12000);
}

export async function GET(){
  const url="https://onway.ge/index.php?route=api/order/regions";
  try{
    const attempts:any[]=[];

    // Official docs list the regions endpoint as a direct URL, so test GET first.
    const getRes=await fetch(url,{method:"GET",cache:"no-store",redirect:"follow"});
    const getText=await getRes.text();
    attempts.push({
      method:"GET",
      status:getRes.status,
      contentType:getRes.headers.get("content-type"),
      body:sanitize(getText)
    });

    // Also test authenticated JSON POST because some OnWay endpoints require credentials.
    const username=process.env.ONWAY_API_USERNAME||"";
    const key=process.env.ONWAY_API_KEY||"";
    if(username&&key){
      const postRes=await fetch(url,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,key}),
        cache:"no-store",
        redirect:"follow"
      });
      const postText=await postRes.text();
      attempts.push({
        method:"POST_JSON_AUTH",
        status:postRes.status,
        contentType:postRes.headers.get("content-type"),
        body:sanitize(postText)
      });
    }else{
      attempts.push({method:"POST_JSON_AUTH",skipped:true,reason:"ONWAY_API_USERNAME ან ONWAY_API_KEY არ არის Vercel environment-ში."});
    }

    return NextResponse.json({
      diagnostic:true,
      endpoint:"api/order/regions",
      attempts
    });
  }catch(e:any){
    return NextResponse.json({
      diagnostic:true,
      error:e?.message||"Unknown fetch error"
    },{status:500});
  }
}
