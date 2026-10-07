import {test} from 'node:test';import assert from 'node:assert/strict';import {assessContentQuality} from '../lib/content-quality';import {buildPublicEdition,type PublicInputArticle} from '../lib/public-edition';import {createPublicReader} from '../lib/public-reader-ui';
const title='晶硅电池效率提升，光伏设备公司利润增长';
const solar='企业发布晶硅电池研发进展，晶硅电池效率提升需要以独立实验室检测和实际量产良率分别核验，光伏设备公司利润增长与产能利用率相关。海外需求变化、设备投入和制造成本是继续观察的条件，不能将研发效率纪录直接等同于行业盈利拐点。';
const buyback='中际旭创回购股份已经实施完成。公司披露回购用于员工股权激励方案，公司董事会解释当前回购计划的资金来源与执行安排，投资者仍需观察市场资金流向。';
test('混合专题含真实副题，也不允许生成只谈副题的错位摘要',()=>{
 const result=assessContentQuality({title,url:'https://example.org/solar',raw_text:buyback+'\n\n'+solar,summary:buyback});
 assert.equal(result.canGenerate,true);assert.equal(result.status,'review');assert.ok(result.reasons.includes('summary_title_subject_mismatch'));
});
test('正文可同时支持两个产业类别，不能以分类优先级误判无依据',()=>{
 const body='公司披露芯片、半导体封装与光刻技术进展。人工智能算力与数据中心软件需求支持相关技术研发。'+solar;
 assert.equal(assessContentQuality({title:'芯片公司数据中心投入说明',url:'https://example.org/chip',raw_text:body,tags:'["AI算力"]'}).status,'accepted');
});
test('同事实只显示一次关键变化，官方转载标明同源，隔离条目不出公开dataset',()=>{
 const title='两国经贸磋商达成阶段性共识';
 const raw='新华社华盛顿电：两国经贸磋商达成阶段性共识。双方说明关税、贸易与投资协商安排，具体执行仍需要双方发布正式文件。后续应观察正式文件中的生效日期、贸易行业覆盖及实施细则，不能只凭共同声明推断企业已获得关税减免。'+solar;
 const rows:PublicInputArticle[]=[1,2,3].map(id=>({id,title,url:'https://example'+id+'.org/news',source_type:'crawled',source_tier:id===3?'official':'media',publisher:id===3?'商务部':'媒体'+id,raw_text:raw,published_at:'2026-09-26',fetched_at:'2026-09-26T01:00:00Z'}));
 rows.push({...rows[0],id:4,url:'https://example.org/failed',raw_text:title});
 const edition=buildPublicEdition(rows,[],'2026-09-26T02:00:00Z'),ui=createPublicReader(edition,'');
 assert.equal(edition.events.length,1);assert.equal(edition.events[0].articleIds.length,3);assert.equal(edition.events[0].sourceFamilyCount,1);assert.equal(edition.articles.find(a=>a.id===3)?.sourceRole,'官方网站转载');assert.ok(!edition.articles.some(a=>a.id===4));
 assert.equal((ui.home().match(/class="key-change"/g)||[]).length,0);
 assert.ok(ui.home().includes('同期材料线索'));
});
