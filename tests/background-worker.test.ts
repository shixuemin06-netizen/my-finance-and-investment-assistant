import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {ensureWorker,workerAddress,workerStatus} from '../scripts/worker-control.mjs';

const projectRoot=process.cwd();
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'finance-background-'));
 for(const dir of ['scripts','lib','pipeline','crawlers'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'scripts','worker.ts'),'// fixture');
 fs.writeFileSync(path.join(root,'scripts','worker-control.mjs'),'// fixture');
 fs.writeFileSync(path.join(root,'sources.json'),'[]');
 return root;
}
function cleanup(root:string){
 const resolved=path.resolve(root),temp=path.resolve(os.tmpdir());
 assert.ok(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('finance-background-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}
async function mockWorker(root:string,status:Record<string,unknown>){
 const server=net.createServer(socket=>socket.on('data',()=>socket.end(JSON.stringify(status))));
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(workerAddress(root),resolve);});
 return server;
}
async function close(server:net.Server){await new Promise<void>(resolve=>server.close(()=>resolve()));}

test('监管进程保留正在采集的 worker，不会为版本更新终止请求',async t=>{
 // Node's test IPC can misframe mixed non-ASCII stdout on Windows. Capture the
 // launcher's normal message here instead of mixing it into runner framing.
 const messages:unknown[][]=[];
 t.mock.method(console,'log',(...args:unknown[])=>{messages.push(args);});
 const root=fixture();
 const status={pid:process.pid,busy:true,root,dataDir:path.join(root,'data'),version:'previous-version',mode:'independent'};
 const server=await mockWorker(root,status);
 try{assert.deepEqual(await ensureWorker(root,{}),status);assert.equal(messages.length,1);}
 finally{await close(server);cleanup(root);}
});

test('数据目录不同的后台进程不会被替换或误用于当前数据库',async()=>{
 const root=fixture();
 const server=await mockWorker(root,{pid:process.pid,busy:false,root,dataDir:path.join(root,'other-data'),version:'previous-version'});
 try{await assert.rejects(()=>ensureWorker(root,{}),/其他数据目录/);}
 finally{await close(server);cleanup(root);}
});

test('独立 worker 在没有网页服务时保持运行，退出不依赖强制结束进程',async()=>{
 const root=fixture();
 for(const dir of ['lib','pipeline','crawlers']){
  fs.rmdirSync(path.join(root,dir));
  fs.symlinkSync(path.join(projectRoot,dir),path.join(root,dir),process.platform==='win32'?'junction':'dir');
 }
 for(const name of ['worker.ts','worker-control.mjs'])fs.copyFileSync(path.join(projectRoot,'scripts',name),path.join(root,'scripts',name));
 fs.copyFileSync(path.join(projectRoot,'sources.json'),path.join(root,'sources.json'));
 fs.mkdirSync(path.join(root,'data'));
 for(const name of ['schema.sql','stories.sql'])fs.copyFileSync(path.join(projectRoot,'data',name),path.join(root,'data',name));
 const db=new DatabaseSync(path.join(root,'data','invest.db'));
 db.exec(fs.readFileSync(path.join(root,'data','schema.sql'),'utf8'));
 db.exec(fs.readFileSync(path.join(root,'data','stories.sql'),'utf8'));
 db.prepare('INSERT INTO scheduler_state(id,last_attempt_at) VALUES(1,?)').run(new Date().toISOString());
 db.close();
 const fetchLog=path.join(root,'unexpected-fetch.log');
 fs.writeFileSync(path.join(root,'no-web-service.mjs'),"import fs from 'node:fs';globalThis.fetch=async()=>{fs.appendFileSync("+JSON.stringify(fetchLog)+",'fetch\\n');throw Error('No website service in fixture');};");
 const workerEnv:NodeJS.ProcessEnv={...process.env,FINANCE_DATA_DIR:path.join(root,'data'),FINANCE_DISABLE_WORKER:'0',FINANCE_PORT:'60998',LLM_REAL_CONTENT_ENABLED:'0'};
 // A worker is a separate application, not a test-runner child. Inheriting
 // NODE_TEST_CONTEXT makes Node emit test IPC frames into these ordinary pipes.
 for(const key of Object.keys(workerEnv))if(key.startsWith('NODE_TEST_'))delete workerEnv[key];
 const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'no-web-service.mjs')).href,'--import',pathToFileURL(path.join(projectRoot,'node_modules','tsx','dist','loader.mjs')).href,path.join(root,'scripts','worker.ts')],{
  cwd:root,env:workerEnv,windowsHide:true,stdio:'pipe',
 });
 let output='';child.stdout?.on('data',chunk=>{output+=chunk.toString();});child.stderr?.on('data',chunk=>{output+=chunk.toString();});
 try{
  let status=null;
  for(let i=0;i<60&&!status;i++){await sleep(100);status=await workerStatus(root);}
  assert.ok(status,'Worker failed to start: '+output);
  assert.equal(status.mode,'independent');
  await sleep(500);
  assert.equal(fs.existsSync(fetchLog),false,'Worker requested web-service health despite a recent completed check');
  const pid=status.pid;
  const reused=await ensureWorker(root,{FINANCE_DATA_DIR:path.join(root,'data'),FINANCE_PORT:'60999'});
  assert.equal(reused?.pid,pid,'Changing a reader port must not replace a running collector');
  await ensureWorker(root,{FINANCE_DATA_DIR:path.join(root,'data'),FINANCE_DISABLE_WORKER:'1'});
  assert.equal(await workerStatus(root),null);
  for(let i=0;i<20&&child.exitCode===null;i++)await sleep(100);
  assert.equal(child.exitCode,0);
 }finally{
  if(child.exitCode===null){child.kill();await new Promise<void>(resolve=>child.once('exit',()=>resolve()));}
  cleanup(root);
 }
});
