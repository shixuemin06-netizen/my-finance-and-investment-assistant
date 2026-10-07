import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import db from '../lib/db';
import {syncStories} from '../lib/stories';
import {updateDue} from '../lib/scheduling';
import {refreshContent} from '../pipeline/refresh';
// @ts-ignore Native launcher is shared with this TypeScript worker.
import {workerAddress,workerVersion} from './worker-control.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=path.resolve(process.env.FINANCE_DATA_DIR||path.join(root,'data'));
const endpoint=workerAddress(root),version=workerVersion(root);
let busy=false,stopping=false,exiting=false,lastCheckAt:string|null=null;
let stopIfIdle:((socket:net.Socket)=>void)|null=null;
const server=net.createServer(socket=>{socket.on('data',data=>{
 if(data.toString().trim()==='stop-if-idle'&&stopIfIdle){stopIfIdle(socket);return;}
 socket.end(JSON.stringify({pid:process.pid,busy,root,dataDir,version,mode:'independent',port:Number(process.env.FINANCE_PORT||3099),lastCheckAt}));
});socket.on('error',()=>{});});
server.on('error',(e:NodeJS.ErrnoException)=>{if(e.code==='EADDRINUSE')process.exit(0);console.error(e.message);process.exit(1);});
server.listen(endpoint,()=>{
 syncStories();
 heartbeat();
 const tick=setInterval(()=>void check(),30000);
 const beat=setInterval(heartbeat,30000);
 function exit(){if(exiting)return;exiting=true;clearInterval(tick);clearInterval(beat);db.prepare('UPDATE scheduler_state SET heartbeat_at=NULL,pid=NULL WHERE id=1 AND pid=?').run(process.pid);server.close(()=>process.exit(0));}
 function stop(){stopping=true;if(!busy)exit();}
 stopIfIdle=socket=>{
  if(busy||stopping){socket.end(JSON.stringify({stopped:false,busy}));return;}
  stopping=true;socket.end(JSON.stringify({stopped:true}),exit);
 };
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
 async function check(){
  if(stopping){if(!busy)exit();return;}
  try{
   if(fs.existsSync(path.join(root,'.env.local')))Object.assign(process.env,parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')));
   if(process.env.FINANCE_DISABLE_WORKER==='1'){stop();return;}
   if(busy)return;
   lastCheckAt=new Date().toISOString();
   const state=db.prepare('SELECT * FROM scheduler_state WHERE id=1').get();
   const last=db.prepare("SELECT max(finished_at) at FROM job_runs WHERE status IN('success','partial') AND source_results IS NOT NULL AND source_results!='[]'").get();
   // Reading pages may be closed. Sleep/outage recovery runs one refresh,
   // without replaying missed hours or expanding the existing model budget.
   if(!updateDue(state?.last_attempt_at,state?.last_success_at||last?.at))return;
   busy=true;
   try{const result=await refreshContent(()=>stopping);console.log(new Date().toISOString(),result);}
   finally{busy=false;if(stopping)exit();}
  }catch(e){console.error('[refresh]',e instanceof Error?e.message:'failed');}
 }
 console.log(new Date().toISOString(),'independent background worker started');
 void check();
});
function heartbeat(){db.prepare('INSERT INTO scheduler_state(id,pid,heartbeat_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET pid=excluded.pid,heartbeat_at=excluded.heartbeat_at').run(process.pid,new Date().toISOString());}
