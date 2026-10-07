'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function RunActions({ modelConfigured, date, pending=0 }: {modelConfigured:boolean;date?:string|null;pending?:number}) {
  const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const stop=useRef(false);const router=useRouter();
  async function run(action:string, continuous=false) {
    stop.current=false;setBusy(action);setMessage(action==='collect'?'正在获取各信源材料…':'正在处理第一批，完成后会显示进度…');
    let total=0;
    try {
      for(let batch=0;batch<(continuous?8:1);batch++) {
        const response=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,date})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'处理失败');
        total+=data.done||0;setMessage(continuous?'本轮已完成 '+total+' 条。'+data.message:data.message);router.refresh();
        if(stop.current||!continuous||!data.done||data.done<5||!data.remaining)break;
      }
    }catch(error){setMessage(error instanceof Error?error.message:'连接中断，已完成内容已保存，请刷新查看。');}
    finally{setBusy('');router.refresh();}
  }
  return <div className="run-actions"><div className="run-buttons">
    <button className="primary-button" disabled={Boolean(busy)} onClick={()=>void run('collect')}>{busy==='collect'?'采集中…':'获取最新材料'}</button>
    <button className="secondary-button" disabled={Boolean(busy)||!modelConfigured||!pending} onClick={()=>void run('summarize',true)}>{busy==='summarize'?'分批处理中…':'连续补齐 · 最多 40 篇'}</button>
    {busy==='summarize'&&<button className="secondary-button" onClick={()=>{stop.current=true;setMessage('将在当前批次完成后停止，已完成内容会保留。');}}>本批完成后停止</button>}
    </div><p className="action-explainer">采集不调用模型；摘要与判断一次生成，每批 5 篇。达到日限额自动停止，关闭页面后不再发起下一批。</p><p role="status" aria-live="polite">{message}</p></div>;
}
