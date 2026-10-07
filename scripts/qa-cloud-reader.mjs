import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const option = (key, fallback) => process.argv.find(x => x.startsWith('--' + key + '='))?.slice(key.length + 3) || fallback;
const base = option('base', 'http://127.0.0.1:3299');
const out = path.resolve(option('out', 'outputs/automation-upgrade-20261004/cloud-qa'));
fs.mkdirSync(out, { recursive: true });
const json = async route => { const response = await fetch(base + route); assert.equal(response.status, 200, route); return response.json(); };
const feed = await json('/api/edition'), second = await json('/api/edition'), email = await json('/api/email-digest');
assert.ok(feed.articles.length >= 1199);
assert.equal(second.update.checkedAt, feed.update.checkedAt);
assert.equal(second.contentUpdatedAt, feed.contentUpdatedAt);
assert.ok(email.text.includes('https://finance-research-shi.shixuemin06.chatgpt.site/'));
assert.equal((await fetch(base + '/assets/edition-seed.json')).status, 404);
assert.equal((await fetch(base + '/api/edition', { method: 'POST' })).status, 405);
const newest = feed.articles[0];
const browser = await chromium.launch({ headless: true });
const report = { checkedAt: new Date().toISOString(), articles: feed.articles.length, receipt: feed.update,
  repeatCheckPreserved: true, email: { subject: email.subject, state: email.state, sourceDate: email.sourceDate }, pages: [] };
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    const page = await context.newPage();
    for (const [name, route] of [['home', '/'], ['article', '/articles/' + newest.id + '/'], ['search', '/search/'], ['about', '/about/']]) {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, title: document.querySelector('h1')?.textContent }));
      assert.ok(dimensions.document <= width + 1, route + ' overflow');
      assert.ok(dimensions.title); assert.equal(errors.length, 0);
      await page.screenshot({ path: path.join(out, name + '-' + width + '.png'), fullPage: true });
      report.pages.push({ width, route, ...dimensions, errors });
    }
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, pages: report.pages.length, articles: feed.articles.length, update: feed.update.status, email: report.email }));
