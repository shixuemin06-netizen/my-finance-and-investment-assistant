/** Public snapshot QA. No paid APIs. No secret values are printed or stored. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const arg = (name, fallback) => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const root = path.resolve(arg('root', 'outputs/quality-upgrade-20260926/public'));
const before = path.resolve(arg('before', 'outputs/quality-upgrade-20260926/before/public'));
const out = path.resolve(arg('out', 'outputs/quality-upgrade-20260926/qa'));
const baselineOnly = process.argv.includes('--baseline-only');
const skipPerformance = process.argv.includes('--skip-performance');
const axePath = path.resolve(arg('axe', 'tmp/qa-tools/axe.min.js'));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'before'), { recursive: true });
fs.mkdirSync(path.join(out, 'after'), { recursive: true });
const report = {
  checkedAt: new Date().toISOString(), passed: false, browser: null,
  conditions: {
    type: 'Local static HTTP snapshot, Chromium headless on Windows; laboratory only',
    widths: [390, 768, 1440], viewportHeight: 1000, accessibilityTarget: 'WCAG 2.2 AA automated subset',
    limitations: 'Automated axe and keyboard samples do not certify full WCAG conformity. No real-user data or mobile/desktop real-user p75. Interaction timing is a laboratory proxy, not reported INP.',
  },
  privacy: {}, responsive: [], accessibility: [], keyboard: [], interactions: [], screenshots: [], performance: [],
  failures: [], jsErrors: [],
};
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
function serve(directory) {
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let target = path.resolve(directory, '.' + pathname);
      if (target !== directory && !target.startsWith(directory + path.sep)) { response.writeHead(403); return response.end(); }
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) { response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return response.end(fs.existsSync(path.join(directory, '404.html')) ? fs.readFileSync(path.join(directory, '404.html')) : '<h1>Not found</h1>'); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
      response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(fs.readFileSync(target));
    } catch { response.writeHead(400); response.end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port })));
}
const loadData = directory => JSON.parse(fs.readFileSync(path.join(directory, 'assets/public-data.json'), 'utf8'));
const slug = route => route === '/' ? 'home' : route.startsWith('/daily') ? 'daily' : route.startsWith('/search') ? 'search' : route.startsWith('/macro') ? 'macro' : route.startsWith('/events') ? 'event' : route.includes('/849/') ? 'article-849' : 'article-detail';
const ready = async page => {
  if (await page.locator('[data-result-status]').count()) await page.waitForFunction(() => !/载入|加载|正在筛选/.test(document.querySelector('[data-result-status]')?.textContent || ''), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
};
const collectOverflow = page => page.evaluate(() => {
  const extra = document.documentElement.scrollWidth - innerWidth;
  const nodes = [...document.querySelectorAll('body *')].filter(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.right > innerWidth + 2 && box.left >= 0;
  }).slice(0, 8).map(node => ({ tag: node.tagName, class: String(node.className).slice(0, 100), right: Math.round(node.getBoundingClientRect().right), width: Math.round(node.getBoundingClientRect().width) }));
  return { extra, nodes };
});
const check = (condition, message) => { if (!condition) report.failures.push(message); };
let browser, currentServer, oldServer;
try {
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const source = baselineOnly ? before : root;
  if (!fs.existsSync(path.join(source, 'assets/public-data.json'))) throw new Error('Public export is not ready: ' + source);
  const data = loadData(source);
  report.exportSnapshot = data.snapshotAt;
  report.assetHashes = Object.fromEntries(['assets/public-data.json','assets/reader.css','assets/reader.js'].filter(file=>fs.existsSync(path.join(source,file))).map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')]));
  const representative = data.articles.find(article => article.judgment && /[\u3400-\u9fff]/u.test(article.title)) || data.articles.find(article => /[\u3400-\u9fff]/u.test(article.title)) || data.articles[0];
  if (!representative) throw new Error('No publishable representative article');
  const primaryRoutes = ['/', '/search/', '/daily/', '/articles/' + representative.id + '/'];
  const routes = [...primaryRoutes, '/events/' + representative.eventId + '/', '/macro/'];
  currentServer = await serve(source);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', error => report.jsErrors.push(error.message));

  async function screenshots(server, label, articles) {
    const detail = articles.find(article => article.id === representative.id) || articles.find(article => article.judgment) || articles[0];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['/', '/search/', '/daily/', '/articles/849/', '/articles/' + detail.id + '/']) {
        const response = await page.goto(server.url + route, { waitUntil: 'networkidle' });
        await ready(page);
        const filename = label + '/' + slug(route) + '-' + width + '.png';
        await page.screenshot({ path: path.join(out, filename), fullPage: true });
        report.screenshots.push({ label, width, route, status: response.status(), file: filename });
      }
    }
  }
  if (baselineOnly) {
    await screenshots(currentServer, 'before', data.articles);
    report.passed = true;
    fs.writeFileSync(path.join(out, 'before-capture.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ phase: 'before', screenshots: report.screenshots.length, browser: report.browser }));
  } else {
    // Read private values only into memory to assert absence; output contains counts, never values.
    const env = fs.existsSync('.env.local') ? parseEnv(fs.readFileSync('.env.local', 'utf8')) : {};
    const secrets = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length > 12).map(([, value]) => value);
    const database = new DatabaseSync('data/invest.db', { readOnly: true });
    const privateIds = database.prepare("SELECT id FROM articles WHERE source_type!='crawled'").all().map(row => Number(row.id));
    const notes = [
      ...database.prepare("SELECT note FROM research_notes WHERE length(trim(note))>=12").all().map(row => String(row.note)),
      ...database.prepare("SELECT note FROM story_state WHERE length(trim(note))>=12").all().map(row => String(row.note)),
    ];
    database.close();
    const files = walk(root), hiddenKeys = new Set(['raw_text', 'raw_html', 'note', 'notes', 'saved', 'followed', 'profile_id', 'user_id', 'api_key', 'research_notes', 'story_state']);
    const forbidden = value => {
      if (Array.isArray(value)) return value.some(forbidden);
      if (value && typeof value === 'object') return Object.entries(value).some(([key, child]) => hiddenKeys.has(key) || forbidden(child));
      return false;
    };
    check(!forbidden(data), 'Public dataset contains a private or raw-storage field');
    check(data.articles.every(article => !privateIds.includes(article.id)), 'Manually imported article appeared publicly');
    for (const file of files) {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      check(!/(?:^|\/)\.env(?:\.|$)/i.test(relative) && !/(?:^|\/)(?:[^/]+\.db(?:-|$)|research|admin|api|import)(?:\/|$)/i.test(relative), 'Private artifact route/file in export: ' + relative);
      if (/\.(?:html|json|js|css|txt)$/i.test(file)) {
        const content = fs.readFileSync(file, 'utf8');
        check(secrets.every(secret => !content.includes(secret)), 'Secret detected in exported text; value withheld');
        check(notes.every(note => !content.includes(note)), 'Private note detected in exported text; value withheld');
      }
    }
    for (const route of ['/research/', '/admin/', '/api/run', '/import/']) check((await fetch(currentServer.url + route)).status === 404, 'Private route is reachable: ' + route);
    report.privacy = { privateArticleIdsExcluded: privateIds.length, privateNotesChecked: notes.length, secretValuesChecked: secrets.length, filesChecked: files.length, bytes: files.reduce((total, file) => total + fs.statSync(file).size, 0) };

    const axe = fs.existsSync(axePath) ? fs.readFileSync(axePath, 'utf8') : null;
    check(Boolean(axe), 'axe-core local QA tool is missing');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        const response = await page.goto(currentServer.url + route, { waitUntil: 'networkidle' });
        await ready(page);
        check(response.status() === 200, 'Responsive route returned ' + response.status() + ': ' + route);
        const overflow = await collectOverflow(page);
        report.responsive.push({ width, route, mode: 'light-standard', overflow });
        check(overflow.extra <= 1, 'Horizontal overflow: ' + width + ' ' + route);
        if (axe && (width === 390 || width === 1440)) {
          await page.addScriptTag({ content: axe });
          const result = await page.evaluate(async () => {
            const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
            return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description, help: item.help, nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })), incomplete: result.incomplete.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })), passes: result.passes.length };
          });
          report.accessibility.push({ width, route, mode: 'light-standard', ...result });
          check(!result.violations.some(item => ['critical', 'serious'].includes(item.impact)), 'axe serious/critical violation: ' + width + ' ' + route);
        }
      }
      await page.goto(currentServer.url + '/', { waitUntil: 'networkidle' });
      await page.keyboard.press('Tab');
      const skip = await page.evaluate(() => {
        const element = document.activeElement, style = getComputedStyle(element);
        return { text: element.textContent?.trim(), href: element.getAttribute('href'), outline: style.outlineStyle, rect: { top: element.getBoundingClientRect().top, left: element.getBoundingClientRect().left } };
      });
      check(skip.href === '#page-content', 'First keyboard focus is not skip link: ' + width);
      await page.keyboard.press('Enter');
      const reachedContent = await page.evaluate(() => document.activeElement?.id === 'page-content');
      check(reachedContent, 'Skip link does not move focus to content: ' + width);
      await page.keyboard.press('Tab');
      const focusVisible = await page.evaluate(() => {
        const element = document.activeElement, style = getComputedStyle(element);
        return { tag: element.tagName, text: element.textContent?.trim().slice(0, 90), href: element.getAttribute('href'), focusVisible: element.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
      });
      check(focusVisible.focusVisible && (focusVisible.outlineStyle !== 'none' || focusVisible.boxShadow !== 'none'), 'Keyboard focused control lacks visible indicator: ' + width);
      report.keyboard.push({ width, skip, reachedContent, focusVisible });
      // Preference state persists across navigation; inspect all principal pages in large dark mode.
      await page.goto(currentServer.url + '/settings/', { waitUntil: 'networkidle' });
      await page.locator('main [data-preference="theme"]').selectOption('dark');
      await page.locator('main [data-preference="size"]').selectOption('large');
      for (const route of primaryRoutes) {
        await page.goto(currentServer.url + route, { waitUntil: 'networkidle' }); await ready(page);
        const overflow = await collectOverflow(page);
        check(overflow.extra <= 1, 'Large dark horizontal overflow: ' + width + ' ' + route);
        const preferences = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, size: document.documentElement.dataset.textSize }));
        check(preferences.theme === 'dark' && preferences.size === 'large', 'Reading preference persistence failed');
        report.responsive.push({ width, route, mode: 'dark-large', overflow });
        if (axe && route === '/' && width === 390) {
          await page.addScriptTag({ content: axe });
          const result = await page.evaluate(async () => {
            const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
            return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })), incomplete: result.incomplete.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })) };
          });
          report.accessibility.push({ width, route, mode: 'dark-large', ...result });
          check(!result.violations.some(item => ['critical', 'serious'].includes(item.impact)), 'axe serious/critical violation in dark large mode');
        }
      }
      await page.goto(currentServer.url + '/settings/');
      await page.locator('main [data-preference="theme"]').selectOption('light');
      await page.locator('main [data-preference="size"]').selectOption('standard');
      console.log('Responsive, keyboard and axe complete at ' + width + 'px');
    }
    // A delayed initial dataset must never expose SSR results/counts for a previous/default condition.
    const delayedPage = await context.newPage();
    delayedPage.on('pageerror', error => report.jsErrors.push(error.message));
    await delayedPage.route('**/assets/public-data.json', async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.continue(); });
    await delayedPage.goto(currentServer.url + '/search/?q=' + encodeURIComponent('不存在的材料质量验收xyz987654'), { waitUntil: 'domcontentloaded' });
    const loading = await delayedPage.evaluate(() => ({ cards: document.querySelector('[data-public-results]')?.querySelectorAll('article').length || 0, count: document.querySelector('[data-result-count]')?.textContent, status: document.querySelector('[data-result-status]')?.textContent }));
    check(loading.cards === 0, 'Old cards flash while query condition dataset is loading');
    check(!/\d+\s*条/.test(loading.count || ''), 'Old result count flashes while a new query is loading');
    await ready(delayedPage);
    const emptyCount = await delayedPage.locator('[data-result-count]').textContent();
    check(/^0\s*条/.test(emptyCount || ''), 'Empty query result count is not zero');
    report.interactions.push({ name: 'initial-query-no-old-results', loading, finalCount: emptyCount });
    await delayedPage.close();
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(currentServer.url + '/search/', { waitUntil: 'networkidle' }); await ready(page);
    const sort = page.locator('[data-filter-form] select[name="sort"]');
    check(await sort.count() === 1, 'Relevance/date sorting control is missing');
    const region = page.locator('[data-filter-form] select[name="region"]');
    if (await region.count()) {
      await region.selectOption('us');
      await page.waitForTimeout(30);
      const actual = await page.locator('[data-result-count]').textContent();
      const expected = data.articles.filter(article => article.region === 'us').length;
      check(new RegExp('^' + expected + '\\s*条').test(actual || ''), 'Region filter count does not match dataset');
      report.interactions.push({ name: 'region-filter-count-synchronized', actual, expected });
      await region.selectOption('');
    }
    if (await sort.count()) {
      const options = await sort.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, text: node.textContent })));
      const relevance = options.find(option => /相关/.test(option.text)), date = options.find(option => /发布|日期/.test(option.text));
      check(Boolean(relevance) && Boolean(date), 'Both relevance and publication-date sort options must exist');
      if (relevance) await sort.selectOption(relevance.value);
      if (date) await sort.selectOption(date.value);
      report.interactions.push({ name: 'sorting-control', options });
    }
    const mainSummary = page.locator('main details summary').first();
    if (await mainSummary.count()) {
      await mainSummary.focus(); await page.keyboard.press('Enter');
      const expanded = await mainSummary.evaluate(element => element.parentElement.open);
      check(expanded, 'Summary disclosure cannot be expanded with keyboard');
      report.interactions.push({ name: 'keyboard-expand-summary', expanded });
    }
    if (await page.locator('[data-load-more]').isVisible()) {
      const countBefore = await page.locator('[data-public-results] article').count();
      await page.locator('[data-load-more]').click();
      const countAfter = await page.locator('[data-public-results] article').count();
      check(countAfter > countBefore, 'Incremental load did not increase visible materials');
      report.interactions.push({ name: 'stable-load-more', countBefore, countAfter });
    }
    await screenshots(currentServer, 'after', data.articles);
    if (fs.existsSync(path.join(before, 'assets/public-data.json'))) {
      oldServer = await serve(before); await screenshots(oldServer, 'before', loadData(before).articles);
    }

    if (!skipPerformance) {
      const profiles = [
        { name: 'desktop-lab', viewport: { width: 1440, height: 1000 }, cpu: 1, latency: 0, download: -1, upload: -1, isMobile: false },
        { name: 'mobile-lab', viewport: { width: 390, height: 1000 }, cpu: 4, latency: 150, download: 1600000 / 8, upload: 750000 / 8, isMobile: true },
      ];
      report.conditions.performance = {
        runsPerRouteAndProfile: 3, coldCache: true, localOrigin: true,
        mobile: { cpuSlowdown: 4, latencyMs: 150, downloadMbps: 1.6, uploadKbps: 750, width: 390 },
        desktop: { cpuSlowdown: 1, networkThrottle: 'none', width: 1440 },
        targets: { LCPMs: 2500, CLS: 0.1, interactionProxyMs: 200 },
        caveat: 'Each run uses a fresh browser context with CDP cache disabled. Local hosting excludes production DNS/TLS/CDN costs. Three runs are laboratory observations, not a field p75 or an INP compliance claim.',
      };
      for (const profile of profiles) {
        for (const route of primaryRoutes) {
          for (let run = 1; run <= 3; run++) {
            const perfContext = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1, isMobile: profile.isMobile, hasTouch: profile.isMobile, colorScheme: 'light' });
            await perfContext.addInitScript(() => {
              window.__labVitals = { lcp: null, lcpElement: null, cls: 0, eventDurations: [], observerErrors: [] };
              let sessionStart = 0, sessionLast = 0, sessionValue = 0;
              try { new PerformanceObserver(list => { for (const entry of list.getEntries()) { window.__labVitals.lcp = entry.startTime; window.__labVitals.lcpElement = entry.element?.tagName || null; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (error) { window.__labVitals.observerErrors.push('lcp'); }
              try { new PerformanceObserver(list => { for (const entry of list.getEntries()) { if (entry.hadRecentInput) continue; if (sessionStart && entry.startTime - sessionLast < 1000 && entry.startTime - sessionStart < 5000) sessionValue += entry.value; else { sessionStart = entry.startTime; sessionValue = entry.value; } sessionLast = entry.startTime; window.__labVitals.cls = Math.max(window.__labVitals.cls, sessionValue); } }).observe({ type: 'layout-shift', buffered: true }); } catch (error) { window.__labVitals.observerErrors.push('cls'); }
              try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__labVitals.eventDurations.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch (error) { window.__labVitals.observerErrors.push('event'); }
            });
            const perfPage = await perfContext.newPage(), cdp = await perfContext.newCDPSession(perfPage);
            await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
            if (profile.latency) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.download, uploadThroughput: profile.upload });
            await perfPage.goto(currentServer.url + route, { waitUntil: 'networkidle' }); await ready(perfPage); await perfPage.waitForTimeout(400);
            const beforeInteraction = await perfPage.evaluate(() => ({ ...window.__labVitals, navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), transferBytes: performance.getEntriesByType('resource').reduce((total, resource) => total + resource.transferSize, 0) }));
            const interactive = perfPage.locator('[data-filter-form] select[name="region"]');
            let disclosure = perfPage.locator('main details summary,article details summary').first();
            if (!(await disclosure.count())) disclosure = perfPage.locator('.reading-settings > summary').first();
            let action = null, actionToPaintMs = null;
            if (await interactive.count()) {
              await perfPage.evaluate(() => { window.__labActionStart = performance.now(); });
              await interactive.focus();
              await perfPage.keyboard.press('ArrowDown');
              await perfPage.keyboard.press('Enter');
              action = 'trusted-keyboard-region-filter-change';
            } else if ((await disclosure.count()) && await disclosure.isVisible()) {
              await perfPage.evaluate(() => { window.__labActionStart = performance.now(); });
              await disclosure.click();
              action = route === '/' ? 'expand-reading-settings' : 'expand-reading-disclosure';
            } else if (route === '/') {
              const globalInput = perfPage.locator('.global-search input[name=q]');
              await globalInput.focus();
              await perfPage.evaluate(() => { window.__labActionStart = performance.now(); });
              await globalInput.pressSequentially('AI');
              action = 'trusted-keyboard-global-search-input';
            }
            if (action) actionToPaintMs = await perfPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - window.__labActionStart)))));
            await perfPage.waitForTimeout(250);
            const afterInteraction = await perfPage.evaluate(() => window.__labVitals);
            const durations = afterInteraction.eventDurations.map(event => event.duration);
            const entry = {
              profile: profile.name, route, run, lcpMs: beforeInteraction.lcp, cls: beforeInteraction.cls,
              lcpElement: beforeInteraction.lcpElement, observerErrors: beforeInteraction.observerErrors,
              transferBytes: beforeInteraction.transferBytes, action, actionToPaintMs,
              eventTimingMaxMs: durations.length ? Math.max(...durations) : null,
              eventTimingSamples: afterInteraction.eventDurations,
              measurementNote: 'eventTimingMax is a small laboratory interaction sample; actionToPaint includes automation dispatch. Neither is field INP.',
            };
            report.performance.push(entry);
            check(typeof entry.lcpMs === 'number', 'LCP observation missing: ' + profile.name + ' ' + route);
            await perfContext.close();
          }
          console.log('Lab performance complete: ' + profile.name + ' ' + route);
        }
      }
    }
    check(report.jsErrors.length === 0, 'Browser JavaScript errors occurred');
    report.passed = report.failures.length === 0;
    fs.writeFileSync(path.join(out, 'public-quality-acceptance.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, responsiveChecks: report.responsive.length, axeChecks: report.accessibility.length, seriousCritical: report.accessibility.reduce((sum, item) => sum + item.violations.filter(v => ['critical', 'serious'].includes(v.impact)).length, 0), keyboardChecks: report.keyboard.length, performanceRuns: report.performance.length, screenshots: report.screenshots.length, privacy: report.privacy, failures: report.failures }));
    if (!report.passed) process.exitCode = 1;
  }
} catch (error) {
  report.failures.push(String(error.message || error));
  fs.writeFileSync(path.join(out, 'public-quality-acceptance.json'), JSON.stringify(report, null, 2));
  console.error('Public QA could not complete: ' + String(error.message || error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const item of [currentServer, oldServer]) if (item) await new Promise(resolve => item.server.close(resolve));
}
