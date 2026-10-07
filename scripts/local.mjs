import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ensureWorker, workerStatus } from './worker-control.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) throw new Error('需要 Node.js 22.13 或以上版本，推荐 Node.js 24 LTS。');
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const command = process.argv[2] || 'start';
const port = Number(process.env.FINANCE_PORT || 3099);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('FINANCE_PORT 必须在 1024–65535 之间。');
const url = 'http://127.0.0.1:' + port;
const project = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
const env = { ...process.env, FINANCE_INSTANCE: project, FINANCE_PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' };
fs.mkdirSync('logs', { recursive: true });
const logPath = path.resolve('logs/web.log');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function health() {
  try {
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.app === 'finance-ledger' && data.instance === project ? data : null;
  } catch { return null; }
}
function occupied() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(false)));
  });
}
function openBrowser() {
  if (process.argv.includes('--no-open') || process.env.FINANCE_NO_OPEN === '1') return;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process '" + url + "'"], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log('请在浏览器打开 ' + url));
  child.unref();
}
async function main() {
  if (command === 'doctor') {
    const sqlite = await import('node:sqlite');
    let database = '首次启动时创建';
    if (fs.existsSync('data/invest.db')) {
      const db = new sqlite.DatabaseSync('data/invest.db', { readOnly: true });
      database = db.prepare('PRAGMA quick_check').get().quick_check; db.close();
    }
    console.log(JSON.stringify({ node: process.version, nextInstalled: fs.existsSync('node_modules/next/dist/bin/next'), database,
      summaryKeyConfigured: Boolean((process.env.LLM_PROVIDER === 'zhipu' ? process.env.ZHIPU_API_KEY : process.env.DEEPSEEK_API_KEY)?.trim()), url, service: await health() ? 'ready' : 'not-running', worker: await workerStatus(root) }, null, 2));
    return;
  }
  if (command === 'worker-status') {
    console.log(JSON.stringify(await workerStatus(root) || { running: false }, null, 2));
    return;
  }
  if (command === 'worker') {
    const status = await ensureWorker(root, env);
    console.log(JSON.stringify(status || { running: false, disabled: env.FINANCE_DISABLE_WORKER === '1' }, null, 2));
    return;
  }
  if (!['start','restart'].includes(command)) throw new Error('用法: node scripts/local.mjs start|restart|doctor|worker|worker-status [--no-open]');
  if (command === 'restart') {
    const current = await health();
    if (current) {
      if (!Number.isInteger(current.pid) || !Number.isInteger(current.parentPid)) throw new Error('旧服务尚不支持安全重启，请先关闭原服务。');
      // The project-specific health identity and parent command must both match before stopping.
      const filter = 'ProcessId = ' + current.pid + ' OR ProcessId = ' + current.parentPid;
      const query = 'Get-CimInstance Win32_Process -Filter "' + filter + '" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
      const raw = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',query], { windowsHide:true, encoding:'utf8' });
      const rows = [JSON.parse(raw)].flat();
      const owner = rows.find(row => row.CommandLine?.includes('node_modules/next/dist/bin/next') && row.CommandLine?.includes('--port ' + port));
      if (!owner || (owner.ProcessId !== current.pid && owner.ProcessId !== current.parentPid)) throw new Error('无法确认服务进程归属，未终止任何程序。');
      try { process.kill(owner.ProcessId); } catch {}
      if (current.pid !== owner.ProcessId) { try { process.kill(current.pid); } catch {} }
      for (let i=0; i<20 && await occupied(); i++) await sleep(250);
      console.log('已停止本项目旧服务，正在重新启动。');
    }
  }
  if (!fs.existsSync('node_modules/next/dist/bin/next')) throw new Error('项目依赖缺失。请先安装依赖（npm ci），再双击启动.bat。');
  if (await health()) { await ensureWorker(root,env); console.log('网页已运行：' + url); openBrowser(); return; }
  const lockPath = 'logs/launch.lock';
  let locked = false;
  try { fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' }); locked = true; }
  catch {
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    let alive = false; try { process.kill(pid, 0); alive = true; } catch {}
    if (alive) { console.log('另一个启动器正在启动网页，请稍候。'); return; }
    fs.unlinkSync(lockPath); fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' }); locked = true;
  }
  try {
    if (await occupied()) throw new Error('端口 ' + port + ' 被其他服务占用。在 .env.local 中设置 FINANCE_PORT=3100 后重试；不会终止其他程序。');
    const output = fs.openSync(logPath, 'a');
    fs.writeSync(output, '\n[启动 ' + new Date().toISOString() + '] ' + process.version + '\n');
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1', '--port', String(port)], {
      cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', output, output], shell: false,
    });
    let exited = false;
    child.on('error', () => { exited = true; }); child.on('exit', () => { exited = true; }); child.unref(); fs.closeSync(output);
    console.log('正在启动网页，首次编译需要一点时间…');
    for (let i = 0; i < 60; i++) {
      if (await health()) {
        const home = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!home.ok) throw new Error('服务已启动，但首页读取失败。请检查 logs/web.log。');
        console.log('已就绪：' + url + '\n摘要服务：' + ((process.env.LLM_PROVIDER === 'zhipu' ? process.env.ZHIPU_API_KEY : process.env.DEEPSEEK_API_KEY)?.trim() ? (process.env.LLM_REAL_CONTENT_ENABLED === '1' ? '已配置，按每日预算自动更新' : '已配置，真实材料处理暂停') : '未配置，可阅读和整理本地材料') + '\n日志：' + logPath);
        await ensureWorker(root,env); openBrowser(); return;
      }
      if (exited) break;
      await sleep(1000);
    }
    throw new Error('启动未就绪。诊断：node scripts/local.mjs doctor；详情：' + logPath);
  } finally { if (locked) fs.unlinkSync(lockPath); }
}
main().catch(error => { console.error('[启动失败] ' + error.message); process.exitCode = 1; });
