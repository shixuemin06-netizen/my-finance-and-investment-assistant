import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
fs.mkdirSync('.sites-runtime', { recursive: true });
const outfile = path.resolve('.sites-runtime/public-refresh.mjs');
await build({ entryPoints: ['cloud-reader/scheduled-refresh.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external' });
const { runScheduledRefresh } = await import(pathToFileURL(outfile).href);
console.log(JSON.stringify(await runScheduledRefresh()));
