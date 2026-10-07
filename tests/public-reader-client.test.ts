import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,type Browser,type Page} from 'playwright';
import {publicReaderClientScript} from '../lib/public-reader-client';
let browser:Browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
function material(id:number,extra:Record<string,unknown>={}){
 return {id,title:'贷款材料 '+id,originalTitle:null,topicLabel:'中国 · 增长与就业',summary:'贷款需求变化摘要',publisher:'测试官方',sourceRole:'官方发布',region:'china',sector:'macro',theme:'growth',publishedAt:'2026-09-26',eventId:'a'.repeat(24),...extra};
}
function documentHtml(pending=true){
 return '<!doctype html><html'+(pending?' data-filter-pending="true"':'')+'><head><style>html[data-filter-pending] [data-public-results],html[data-filter-pending] [data-result-count]{visibility:hidden}</style></head><body><main id="page-content" data-view="search"><form data-filter-form><input name="q"><select name="region"><option value="">全部</option><option value="china">中国</option><option value="us">美国</option></select><select name="sector"><option value="">全部</option><option value="macro">宏观</option><option value="energy">能源</option></select><select name="theme"><option value="">全部</option><option value="growth">增长</option></select><select name="sort"><option value="relevance">相关性</option><option value="date">日期</option></select><button>筛选</button></form><p data-result-count>旧条件 99 条</p><section data-public-results data-initial-results><p>OLD_STALE_SSR</p></section><p data-result-status aria-live="polite"></p><button data-load-more hidden>显示更多材料</button></main><script>'+publicReaderClientScript()+'</script></body></html>';
}
async function harness(rows:ReturnType<typeof material>[],query='?q='+encodeURIComponent('贷款')){
 const context=await browser.newContext(),page=await context.newPage();
 let release!:()=>void,requested!:()=>void;
 const delayed=new Promise<void>(resolve=>release=resolve),incoming=new Promise<void>(resolve=>requested=resolve);
 await page.route('**/*',async route=>{
  if(new URL(route.request().url()).pathname==='/assets/public-data.json'){requested();await delayed;return route.fulfill({contentType:'application/json',body:JSON.stringify({articles:rows,issues:[]})});}
  await route.fulfill({contentType:'text/html; charset=utf-8',body:documentHtml(Boolean(query))});
 });
 await page.goto('http://127.0.0.1:31888/search/'+query,{waitUntil:'domcontentloaded'});await incoming;
 return {page,release,close:()=>context.close()};
}
async function ready(page:Page){await page.waitForFunction(()=>document.querySelector('[data-public-results]')?.getAttribute('aria-busy')==='false');}
test('延迟载入期间立即清旧卡片与计数，提交不导航，返回后按最新筛选同步呈现',async()=>{
 const h=await harness([material(1),material(2,{region:'us',title:'美国贷款数据'})]);
 try{
  assert.ok(!(await h.page.locator('[data-public-results]').textContent())?.includes('OLD_STALE_SSR'));
  assert.equal(await h.page.locator('[data-result-count]').textContent(),'正在载入筛选结果…');
  await h.page.locator('[name=region]').selectOption('china');await h.page.locator('[name=region]').selectOption('us');
  await h.page.getByRole('button',{name:'筛选',exact:true}).click();
  assert.ok(h.page.url().includes('region=us'));assert.equal(await h.page.locator('.story-row').count(),0);
  h.release();await ready(h.page);
  assert.equal(await h.page.locator('.story-row').count(),1);assert.equal(await h.page.locator('[data-result-count]').textContent(),'1 条公开材料');
  assert.ok((await h.page.locator('.story-row').textContent())?.includes('美国贷款数据'));
  assert.equal(await h.page.evaluate(()=>document.documentElement.dataset.filterPending),undefined);
 }finally{h.release();await h.close();}
});
test('关键词及分类变化同步重算数量，20条增量稳定且无重复',async()=>{
 const rows=Array.from({length:45},(_,i)=>material(i+1,{sector:i<25?'macro':'energy'})),h=await harness(rows,'');
 try{
  await h.page.locator('[name=q]').fill('贷款');assert.equal(await h.page.locator('.story-row').count(),0);
  h.release();await ready(h.page);assert.equal(await h.page.locator('.story-row').count(),20);
  await h.page.getByRole('button',{name:'显示更多材料'}).click();assert.equal(await h.page.locator('.story-row').count(),40);
  const links=await h.page.locator('.story-row h2 a').evaluateAll(elements=>elements.map(a=>a.getAttribute('href')));assert.equal(new Set(links).size,40);
  await h.page.locator('[name=sector]').selectOption('energy');
  assert.equal(await h.page.locator('[data-result-count]').textContent(),'20 条公开材料');assert.equal(await h.page.locator('.story-row').count(),20);
  assert.equal(await h.page.locator('[data-load-more]').isVisible(),false);
  await h.page.locator('[name=q]').fill('无此材料');assert.equal(await h.page.locator('.story-row').count(),0);assert.equal(await h.page.locator('[data-result-count]').textContent(),'0 条公开材料');
 }finally{h.release();await h.close();}
});
test('相关性优先标题，发布日期排序将缺日期排末',async()=>{
 const h=await harness([material(1,{title:'贷款需求走弱',publishedAt:'2026-09-20'}),material(2,{title:'融资发布',summary:'贷款增长放缓',publishedAt:'2026-09-26'}),material(3,{title:'融资情况',summary:'贷款数据',publishedAt:null})]);
 try{
  h.release();await ready(h.page);assert.equal(await h.page.locator('.story-row h2').first().textContent(),'贷款需求走弱');
  await h.page.locator('[name=sort]').selectOption('date');
  assert.deepEqual(await h.page.locator('.story-row h2').allTextContents(),['融资发布','贷款需求走弱','融资情况']);
  assert.ok((await h.page.locator('.story-row').last().textContent())?.includes('发布日期未标注'));
 }finally{h.release();await h.close();}
});
test('标题摘要和来源类型只作为文本渲染，脚本和HTML不执行',async()=>{
 const h=await harness([material(1,{title:'贷款 <img src=x onerror="window.PWNED=1">',summary:'<script>window.PWNED=1</script>',sourceRole:'媒体转述'})]);
 try{
  h.release();await ready(h.page);assert.equal(await h.page.locator('[data-public-results] img').count(),0);
  assert.equal(await h.page.evaluate(()=>('PWNED' in window)),false);
  assert.ok((await h.page.locator('.story-row').textContent())?.includes('媒体转述'));assert.ok((await h.page.locator('.story-row').textContent())?.includes('2026-09-26'));
 }finally{h.release();await h.close();}
});
test('载入失败清除旧结果及pending，保留条件，键盘可重试',async()=>{
 const context=await browser.newContext(),page=await context.newPage();let calls=0;
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).pathname==='/assets/public-data.json')return route.fulfill(++calls===1?{status:503,body:'unavailable'}:{contentType:'application/json',body:JSON.stringify({articles:[material(1)],issues:[]})});
  return route.fulfill({contentType:'text/html; charset=utf-8',body:documentHtml()});
 });
 try{
  await page.goto('http://127.0.0.1:31888/search/?q='+encodeURIComponent('贷款'));
  const retry=page.getByRole('button',{name:'重试载入'});await retry.waitFor();
  assert.equal(await page.locator('[data-result-count]').textContent(),'结果暂不可用');assert.equal(await page.locator('[name=q]').inputValue(),'贷款');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.filterPending),undefined);
  await retry.focus();await page.keyboard.press('Enter');await ready(page);
  assert.equal(await page.locator('.story-row').count(),1);assert.equal(calls,2);
 }finally{await context.close();}
});
test('兼容既有公开偏好key；日报参考材料在本页检索',async()=>{
 const context=await browser.newContext(),page=await context.newPage();
 await context.addInitScript(()=>localStorage.setItem('finance-public-reading-preferences',JSON.stringify({theme:'dark',size:'large',width:'wide'})));
 const body='<html><body><select data-preference="theme"><option value="dark">夜间</option><option value="light">日间</option></select><section data-reference-section><label>参考资料<input data-reference-filter></label><p data-reference-count></p><article data-reference-row>中国就业材料</article><article data-reference-row>美国能源材料</article></section><script>'+publicReaderClientScript()+'</script></body></html>';
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
 try{
  await page.goto('http://127.0.0.1:31888/daily/');
  assert.deepEqual(await page.evaluate(()=>({theme:document.documentElement.dataset.theme,size:document.documentElement.dataset.textSize,width:document.documentElement.dataset.readingWidth})),{theme:'dark',size:'large',width:'wide'});
  await page.locator('[data-reference-filter]').fill('能源');assert.equal(await page.locator('[data-reference-row]:visible').count(),1);assert.equal(await page.locator('[data-reference-count]').textContent(),'1 / 2 篇参考材料');
  await page.locator('[data-preference=theme]').selectOption('light');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('finance:reading')||'{}').theme),'light');
 }finally{await context.close();}
});

test('869条冷载入后首个真实键盘搜索保持20行，同材料复用节点且数量匹配',async()=>{
 const h=await harness(Array.from({length:869},(_,i)=>material(i+1,{title:'AI research '+(i+1),summary:'人工智能材料摘要与验证条件。'.repeat(40)})),'');
 try{
  h.release();await ready(h.page);assert.equal(await h.page.locator('.story-row').count(),20);
  await h.page.evaluate(()=>{(window as any).__firstRowNode=document.querySelector('.story-row');});
  await h.page.locator('[name=q]').focus();await h.page.keyboard.type('AI');
  assert.equal(await h.page.locator('[data-result-count]').textContent(),'869 条公开材料');
  assert.equal(await h.page.locator('.story-row').count(),20);
  assert.equal(await h.page.evaluate(()=>document.querySelector('.story-row')===(window as any).__firstRowNode),true);
  await h.page.locator('[name=q]').fill('AI research 869');
  assert.equal(await h.page.locator('[data-result-count]').textContent(),'1 条公开材料');
  assert.equal(await h.page.locator('.story-row h2').textContent(),'AI research 869');
 }finally{h.release();await h.close();}
});

test('搜索保留原文摘录与模型摘要的区别，不因动态渲染改变证据类型',async()=>{
 const h=await harness([material(1,{summaryKind:'source_excerpt'}),material(2,{summaryKind:'model'})],'');
 try{
  h.release();await ready(h.page);
  assert.equal(await h.page.locator('.story-row').filter({hasText:'贷款材料 1'}).locator('.inline-label').textContent(),'原文摘录');
  assert.equal(await h.page.locator('.story-row').filter({hasText:'贷款材料 2'}).locator('.inline-label').textContent(),'模型摘要');
 }finally{h.release();await h.close();}
});

test('不含搜索控件的静态页面也按收录时间显示过期状态',async()=>{
 const context=await browser.newContext(),page=await context.newPage();
 await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-04T00:00:00Z');});
 const body='<html><body><section data-content-updated-at="2026-09-30T16:00:00Z"><strong data-freshness-status>资料快照</strong><p data-freshness-message></p></section><script>'+publicReaderClientScript()+'</script></body></html>';
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
 try{
  await page.goto('http://127.0.0.1:31888/');
  assert.equal(await page.locator('[data-content-updated-at]').getAttribute('data-freshness-state'),'stale');
  assert.equal(await page.locator('[data-freshness-status]').textContent(),'3 天未收录新材料');
  assert.ok((await page.locator('[data-freshness-message]').textContent())?.includes('重新发布页面不代表新增资讯'));
 }finally{await context.close();}
});
