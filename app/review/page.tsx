import {redirect} from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const q=await searchParams,p=new URLSearchParams();for(const [k,v] of Object.entries(q))if(v)p.set(k,Array.isArray(v)?v[0]:v);redirect('/admin'+(p.size?'?'+p:''));}
