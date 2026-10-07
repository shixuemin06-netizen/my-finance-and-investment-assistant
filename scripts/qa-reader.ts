/** Production browser checks against an isolated disposable database. No paid model calls. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from 'playwright';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(root,'tmp','reader-qa-'));
process.env.FINANCE_DATA_DIR=dir;
const {default:db}=await import('../lib/db');
const {syncStories,queryStories,getStory}=await import('../lib/stories');
const now=new Date().toISOString();
db.prepare("INSERT INTO articles(id,title,url,publisher,source_tier,is_primary,raw_text,published_at,fetched_at) VALUES(1,?,'https://example.org/qa/1','测试官方机构','official',1,?,?,?)").run('美联储 2026-09-16 利率决议：用于验收的虚构测试材料','这是测试原文，不是实际新闻。'.repeat(20),now,now);
db.prepare("INSERT INTO summaries(article_id,summary,tags) VALUES(1,'测试摘要：只用于验证阅读流程，不是实际金融信息。','[]')").run();
db.prepare("INSERT INTO articles(id,title,url,publisher,raw_text,fetched_at) VALUES(3,?,'https://example.org/qa/3','测试来源',?,?)").run('缺失日期与长标题状态：'+ '需要核对来源和口径的材料'.repeat(14),'长标题测试原文。'.repeat(10),now);
syncStories();const story=queryStories().items.find(s=>s.representative_article_id===1)!;
const port=3199,url='http://127.0.0.1:'+port;
try{await fetch(url,{signal:AbortSignal.timeout(800)});throw Error('QA port is already occupied');}catch(e){if((e as Error).message==='QA port is already occupied')throw e;}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,FINANCE_BUILD_DIR:'.next-production',FINANCE_DISABLE_WORKER:'1'},windowsHide:true,stdio:'ignore'});
let browser;const checks:string[]=[];
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'QA server starts');
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
 await page.goto(url+'/stories/'+story.id);await page.getByRole('button',{name:'＋ 关注',exact:true}).click();await page.getByRole('button',{name:'✓ 已关注',exact:true}).waitFor();
 await page.getByRole('link',{name:'核对已保存原文 →',exact:true}).click();await page.getByText('这是测试原文，不是实际新闻。'.repeat(20),{exact:true}).waitFor();await page.goBack();
 const note='验收笔记：保留条件与反证。';await page.getByLabel('我的研究笔记').fill(note);await page.getByRole('button',{name:'保存笔记',exact:true}).click();await page.getByText('笔记已保存',{exact:true}).waitFor();
 await page.getByRole('button',{name:'收藏事件',exact:true}).click();await page.getByRole('button',{name:'✓ 已收藏',exact:true}).waitFor();await page.getByRole('button',{name:'✓ 已收藏',exact:true}).click();await page.getByText('已取消收藏，笔记保留',{exact:true}).waitFor();assert.equal(getStory(story.id)!.note,note);assert.equal(getStory(story.id)!.saved,0);checks.push('发现事件 → 核对原文 → 关注 → 保存笔记；取消收藏保留笔记');
 await page.getByRole('button',{name:'标记本次已读',exact:true}).click();await page.getByText('本次进展已读',{exact:true}).waitFor();assert.equal(getStory(story.id)!.unread,0);
 db.prepare("INSERT INTO articles(id,title,url,publisher,raw_text,published_at,fetched_at) VALUES(2,?,'https://example.org/qa/2','测试转载来源','新增测试材料',?,?)").run('美联储 2026-09-16 利率决议：后续测试报道',now,now);syncStories([2]);
 await page.goto(url+'/research');await page.getByText('有新进展',{exact:true}).waitFor();assert.ok(getStory(story.id)!.unread>0);
 await page.goto(url+'/stories/'+story.id);assert.equal(await page.getByLabel('我的研究笔记').inputValue(),note);checks.push('跨日追加报道 → 回访显示未读进展，笔记持久化');
 await page.route('**/api/stories/*/state',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试网络中断，请重试'})}));
 await page.getByLabel('我的研究笔记').fill(note+'断网仍保留草稿');await page.getByRole('button',{name:'保存笔记',exact:true}).click();await page.getByRole('alert').getByText('测试网络中断，请重试').waitFor();assert.equal(await page.getByLabel('我的研究笔记').inputValue(),note+'断网仍保留草稿');await page.unroute('**/api/stories/*/state');await page.getByRole('button',{name:'保存笔记',exact:true}).click();await page.getByText('笔记已保存',{exact:true}).waitFor();checks.push('保存失败保留输入并可重试');
 const bad=await page.request.post(url+'/api/stories/'+story.id+'/state',{headers:{origin:'https://foreign.example'},data:{action:'follow',value:false}});assert.equal(bad.status(),403);
 await page.goto(url+'/articles/3');await page.getByText('发布日期待核',{exact:true}).waitFor();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('发布日期缺失与超长标题：390px 无溢出');
 await page.goto(url+'/search?q=没有这个词');await page.getByText('暂无匹配内容',{exact:true}).waitFor();
 await page.goto(url+'/');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'跳到正文');checks.push('空结果与键盘跳转可用');
 for(const [old,current]of [['/matrix','/search'],['/notebook','/research'],['/archive','/daily'],['/review','/admin']]){await page.goto(url+old);await page.waitForURL(url+current);assert.equal(new URL(page.url()).pathname,current);}checks.push('旧地址兼容跳转');
 const out=path.join(root,'outputs/product-rebuild-20260922/qa/interaction.json');fs.writeFileSync(out,JSON.stringify({passed:true,checks,isolatedDatabase:dir,noModelRequests:true},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser?.close();server.kill();}
