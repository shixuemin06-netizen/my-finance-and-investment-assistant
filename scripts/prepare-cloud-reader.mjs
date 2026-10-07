/** Assemble only the public reader capability in the already-opened Site checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at < 0 ? null : args[at + 1]; };
const site = path.resolve(option('--site') || path.join(root, 'outputs/public-release-20260926/site'));
const publicDir = path.resolve(option('--public') || '');
if (!site.startsWith(root + path.sep) || !publicDir.startsWith(root + path.sep) || !fs.existsSync(path.join(publicDir, 'assets/edition-seed.json'))) throw Error('Use workspace-owned Site and reviewed public export');
const hosting = JSON.parse(fs.readFileSync(path.join(site, '.openai/hosting.json'), 'utf8'));
if (hosting.project_id !== 'appgprj_6ab78c736be881919bb40c9df0e4434c') throw Error('Unexpected Site');
const copied = new Set();
function copySource(relative) {
  const source = path.join(root, relative);
  if (copied.has(relative)) return;
  if (/^(?:data|outputs|node_modules|\.env|参考文献)/.test(relative)) throw Error('Private source boundary');
  copied.add(relative);
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (relative === 'sources.json') {
    const config = JSON.parse(fs.readFileSync(source, 'utf8'));
    const official = config.official.map(({ id, name, enabled }) => ({ id, name, enabled }));
    const rss = config.rss.filter(row => row.tier === 'official' && row.isPrimary).map(({ name, url, enabled, tier, isPrimary }) => ({ name, url, enabled, tier, isPrimary }));
    fs.writeFileSync(destination, JSON.stringify({ official, rss }));
    return;
  }
  fs.copyFileSync(source, destination);
  const text = fs.readFileSync(source, 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(source), match[1]);
    const dependency = [base, base + '.ts', base + '.mjs'].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    if (!dependency) throw Error('Missing dependency: ' + match[1]);
    copySource(path.relative(root, dependency));
  }
}
copySource('cloud-reader/worker.ts');
copySource('cloud-reader/scheduled-refresh.ts');
for (const name of ['run-refresh.mjs', 'run-email.mjs']) fs.copyFileSync(path.join(root, 'cloud-reader', name), path.join(site, 'cloud-reader', name));
fs.copyFileSync(path.join(root, 'cloud-reader/README.md'), path.join(site, 'README.md'));
fs.copyFileSync(path.join(root, 'cloud-reader/build.mjs'), path.join(site, 'build.mjs'));
fs.mkdirSync(path.join(site, 'db'), { recursive: true });
fs.copyFileSync(path.join(root, 'cloud-reader/schema.mjs'), path.join(site, 'db/schema.ts'));
fs.writeFileSync(path.join(site, 'drizzle.config.ts'), "import { defineConfig } from 'drizzle-kit';\nexport default defineConfig({ dialect: 'sqlite', schema: './db/schema.ts', out: './drizzle' });\n");
fs.writeFileSync(path.join(site, 'package.json'), JSON.stringify({ name: 'finance-public-reader', private: true, type: 'module',
  scripts: { build: 'node build.mjs', 'db:generate': 'drizzle-kit generate' },
  dependencies: { cheerio: '1.2.0', 'drizzle-orm': '0.45.2' },
  devDependencies: { esbuild: '0.27.0', 'drizzle-kit': '0.31.10', wrangler: '4.92.0' } }, null, 2));
fs.writeFileSync(path.join(site, '.gitignore'), 'node_modules/\n.wrangler/\n.sites-runtime/\n*.log\n.env*\n');
// Runtime bindings replace the former static-only manifest; preserve the same owned public Site.
fs.writeFileSync(path.join(site, '.openai/hosting.json'), JSON.stringify({ project_id: hosting.project_id, d1: 'DB' }));
const assets = path.join(site, 'public');
if (fs.existsSync(assets)) fs.rmSync(assets, { recursive: true, force: true });
fs.cpSync(publicDir, assets, { recursive: true });
console.log(JSON.stringify({ site, sources: copied.size, publicFiles: fs.readdirSync(publicDir).length, projectId: hosting.project_id }));
