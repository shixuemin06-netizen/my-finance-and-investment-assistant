import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function workerAddress(root){
 const key=createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
 return process.platform==='win32'?'\\\\.\\pipe\\finance-worker-'+key:path.join(os.tmpdir(),'finance-worker-'+key+'.sock');
}
function requestWorker(root,command){
 return new Promise(resolve=>{
  const socket=net.createConnection(workerAddress(root));let text='';
  socket.setTimeout(1500);
  socket.on('connect',()=>socket.write(command+'\n'));
  socket.on('data',data=>{text+=data;try{const value=JSON.parse(text);resolve(value);socket.destroy();}catch{}});
  socket.on('timeout',()=>{socket.destroy();resolve(null);});socket.on('error',()=>resolve(null));socket.on('end',()=>resolve(null));
 });
}
export function workerStatus(root){return requestWorker(root,'status');}
export function workerVersion(root){
 const sourceFiles=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(dir+'/'+entry.name):entry.name.endsWith('.ts')?[dir+'/'+entry.name]:[]);
 const files=['scripts/worker.ts','scripts/worker-control.mjs','sources.json',...['lib','pipeline','crawlers'].flatMap(sourceFiles).sort()];
 const hash=createHash('sha256');for(const file of files)hash.update(fs.readFileSync(path.join(root,file)));return hash.digest('hex').slice(0,16);
}
export async function ensureWorker(root,env){
 const existing=await workerStatus(root);
 const dataDir=path.resolve(env.FINANCE_DATA_DIR||path.join(root,'data'));
 if(existing?.dataDir&&path.resolve(existing.dataDir)!==dataDir)throw new Error('后台进程正在使用其他数据目录，未终止或替换');
 if(existing&&existing.version===workerVersion(root)&&env.FINANCE_DISABLE_WORKER!=='1')return existing;
 if(existing){
  if(path.resolve(existing.root)!==path.resolve(root)||!Number.isInteger(existing.pid))throw new Error('无法确认后台进程归属');
  // Windows process.kill terminates immediately. Preserve an in-flight request;
  // the next supervisor run replaces the worker after that request finishes.
  if(existing.busy){console.log('后台正在完成本轮更新，稍后自动应用程序变更。');return existing;}
  if(existing.mode==='independent'){
   const result=await requestWorker(root,'stop-if-idle');
   if(!result?.stopped){console.log('后台正在处理任务，稍后重试程序更新。');return existing;}
  }else{
   // Compatibility with workers created before the independent runtime.
   try{process.kill(existing.pid);}catch(e){if(e.code!=='ESRCH')throw e;}
  }
  for(let i=0;i<20&&await workerStatus(root);i++)await new Promise(r=>setTimeout(r,100));
  if(await workerStatus(root))throw new Error('旧后台进程仍在退出，未启动重复更新进程');
 }
 if(env.FINANCE_DISABLE_WORKER==='1')return;
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 const log=fs.openSync(path.join(root,'logs','worker.log'),'a');
 const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'node_modules','tsx','dist','loader.mjs')).href,path.join(root,'scripts','worker.ts')],{cwd:root,env,detached:true,windowsHide:true,stdio:['ignore',log,log],shell:false});
 child.on('error',e=>console.error('后台更新启动失败：'+e.message));child.unref();fs.closeSync(log);
 for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,300));const status=await workerStatus(root);if(status)return status;}
 throw new Error('后台更新尚未就绪，请查看管理页或 logs/worker.log。');
}
