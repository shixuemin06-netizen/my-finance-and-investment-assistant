/** Supported Site service access: credentials arrive through hidden stdin, never files or argv. */
import fs from 'node:fs';
process.stdin.setEncoding('utf8');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for Site service-access JSON on hidden stdin.\n');
const input = await new Promise(resolve => {
  let buffer = '';
  process.stdin.on('data', chunk => { buffer += chunk; if (/[\r\n]/.test(buffer)) resolve(buffer.split(/[\r\n]/)[0]); });
});
process.stdin.pause();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const { token } = JSON.parse(input);
const origin = 'https://finance-research-shi.shixuemin06.chatgpt.site';
const headers = token ? { 'OAI-Sites-Authorization': 'Bearer ' + token } : {};
const report = { checkedAt: new Date().toISOString(), authenticatedServiceAccess: Boolean(token), requests: [] };
for (const route of ['/api/edition', '/api/status', '/api/email-digest']) {
  const response = await fetch(origin + route, { headers, redirect: 'manual' });
  const body = await response.text();
  let data = null;
  try { data = JSON.parse(body); } catch {}
  report.requests.push({ route, status: response.status, type: response.headers.get('content-type'), title: body.match(/<title>(.*?)<\/title>/s)?.[1],
    ...(data ? { articles: data.articles?.length, events: data.events?.length, issues: data.issues?.length,
      contentUpdatedAt: data.contentUpdatedAt, receipt: data.update, subject: data.subject, state: data.state, sourceDate: data.sourceDate, articleIds: data.articleIds, error: data.error } : {}) });
  if (!response.ok) break;
}
fs.writeFileSync('outputs/automation-upgrade-20261004/cloud-live-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
