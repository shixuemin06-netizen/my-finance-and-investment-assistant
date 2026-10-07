import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupEventArticles,compareEventMaterials,type EventMaterial} from '../lib/event-grouping';
const shared='双方主管部门公布产业合作协议，将建立技术标准协调机制，并披露下一轮工作安排。后续需按实际执行进度核对项目数量和约束条件。协议不包含企业盈利或资产价格承诺。'.repeat(4);
function row(id:number,title:string,body=shared,extra:Partial<EventMaterial>={}):EventMaterial{return {id,title,url:'https://source'+id+'.example/news/'+id,publisher:'媒体 '+id,published_at:'2026-09-26',fetched_at:'2026-09-26T01:00:00Z',raw_text:body,...extra};}
test('相同事实跨来源按正文与日期确认，改写标题仍需实质正文覆盖',()=>{
 const rows=[row(1,'两国达成产业合作协议'),row(2,'两国达成产业合作协议','来源：新华社\n'+shared),row(3,'两国达成产业合作协议',shared,{source_tier:'official',is_primary:1})];
 const grouped=groupEventArticles(rows);
 assert.equal(grouped.groups.length,1);assert.equal(grouped.groups[0].representativeArticleId,3);
 assert.equal(grouped.counts.mergedMaterials,2);assert.equal(grouped.groups[0].independentSourceCount,1);
 assert.equal(grouped.groups[0].sourceFamilies[0].basis,'attribution');
 assert.equal(compareEventMaterials(row(4,'两国达成产业合作协议及新安排'),row(5,'两国达成产业合作协议及新安排')).status,'confirmed');
});
test('同主题不同统计月份、会议日期、政策动作不能合并',()=>{
 assert.equal(compareEventMaterials(row(1,'美国2026年8月就业报告公布'),row(2,'美国2026年9月就业报告公布')).status,'separate');
 assert.equal(compareEventMaterials(row(1,'央行2026年9月16日利率决议'),row(2,'央行2026年10月16日利率决议')).status,'separate');
 assert.equal(compareEventMaterials(row(1,'央行决定下调利率，公布最新决议'),row(2,'央行决定维持利率，公布最新决议')).status,'separate');
});
test('只有标题、缺日期、不同日重复标题或正文冲突进入复核而不自动关联',()=>{
 for(const other of [row(2,'两国达成产业合作协议','标题而已'),row(2,'两国达成产业合作协议',shared,{published_at:null}),row(2,'两国达成产业合作协议',shared,{published_at:'2026-09-25'}),row(2,'两国达成产业合作协议','企业宣布股票回购资金安排，公司董事会审批后实施，金额及用途仍待披露。'.repeat(8))]){
  const g=groupEventArticles([row(1,'两国达成产业合作协议'),other]);assert.equal(g.groups.length,2);assert.equal(g.reviewPairs.length,1);
 }
});
test('同一明确事件日期的后续转载可跨日归并，久远同标题不可',()=>{
 assert.equal(compareEventMaterials(row(1,'两国2026年9月25日产业合作协议公布'),row(2,'两国2026年9月25日产业合作协议公布',shared,{published_at:'2026-09-27'})).status,'confirmed');
 assert.equal(compareEventMaterials(row(1,'两国达成产业合作协议'),row(2,'两国达成产业合作协议',shared,{published_at:'2026-09-20'})).status,'separate');
});
test('canonical material标识优先且ID不随输入顺序改变，不修改传入材料',()=>{
 const a=row(1,'两国达成产业合作协议'),b=row(2,'两国达成产业合作协议');
 const before=JSON.stringify([a,b]);assert.equal(groupEventArticles([a,b]).groups[0].id,groupEventArticles([b,a]).groups[0].id);assert.equal(JSON.stringify([a,b]),before);
 assert.equal(compareEventMaterials(a,{...b,canonical_url:a.url+'?utm_source=test'}).status,'confirmed');
});
test('正文高度一致的转载不升级独立佐证，同站报道也只算一组',()=>{
 const g=groupEventArticles([row(1,'两国达成产业合作协议','据新华社报道。'+shared),row(2,'两国达成产业合作协议','新华社华盛顿电。'+shared),row(3,'两国达成产业合作协议')]);
 assert.equal(g.groups[0].independentSourceCount,1);assert.deepEqual(g.groups[0].sourceFamilies[0].articleIds,[1,2,3]);
});

test('相似长正文含不同关键数值，不因措辞重复自动归并',()=>{
 const g=groupEventArticles([row(1,'央行公布本期公开市场操作',shared+'本次投放100亿元。'),row(2,'央行公布本期公开市场操作',shared+'本次投放200亿元。')]);
 assert.equal(g.groups.length,2);assert.equal(g.reviewPairs[0].reasons[0],'body_fact_numbers_require_review');
 assert.equal(g.groups[0].sourceFamilyCount,1);assert.equal(g.groups[0].independence,'unverified');
});
