 "use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";

export default function Login(){
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");const {error}=await createClient().auth.signInWithPassword({email,password});if(error)setError(error.message);else router.push("/dashboard");setLoading(false);}
 return <div className="login"><form className="loginbox" onSubmit={submit}><h1>შეკვეთების სისტემა</h1><p className="muted">თანამშრომლის შესვლა</p>{error&&<div className="error">{error}</div>}<div className="field"><label>ელფოსტა</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>პაროლი</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div><button className="btn" disabled={loading}>{loading?"იტვირთება...":"შესვლა"}</button></form></div>
}
