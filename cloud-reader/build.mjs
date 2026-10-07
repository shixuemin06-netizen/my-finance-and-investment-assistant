import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
const root = process.cwd();
const output = path.join(root, 'dist');
// Only this project's generated build output is replaced.
if (!output.startsWith(root + path.sep)) throw Error('Invalid output');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'server'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(output, 'client'), { recursive: true });
await build({ entryPoints: ['cloud-reader/worker.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm',
  platform: 'browser', target: 'es2022', external: ['node:*', 'cloudflare:*'], conditions: ['browser'], minify: true });
const hosting = JSON.parse(fs.readFileSync('.openai/hosting.json', 'utf8'));
fs.mkdirSync(path.join(output, '.openai'), { recursive: true });
fs.writeFileSync(path.join(output, '.openai/hosting.json'), JSON.stringify(hosting));
fs.cpSync('drizzle', path.join(output, '.openai/drizzle'), { recursive: true });
fs.writeFileSync(path.join(output, 'server/wrangler.json'), JSON.stringify({ name: 'finance-public-reader', main: 'index.js',
  compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'],
  assets: { directory: '../client', binding: 'ASSETS', run_worker_first: true },
  d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }] }, null, 2));
console.log('Cloud reader build ready');
