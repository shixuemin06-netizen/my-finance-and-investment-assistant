import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyArticle,industryRegionQuery,industrySectorKeys} from '../lib/story-classification';
import {extractPublishedDate} from '../crawlers/metadata';
const article=(title:string,publisher='',url='https://example.org/a')=>({id:1,title,publisher,url,fetched_at:'2026-09-26T00:00:00Z'});
test('产业细分识别半导体、制造、电力、文旅和消费，保留旧产业入口',()=>{
 assert.ok(industrySectorKeys.includes('ai'));assert.ok(industrySectorKeys.includes('manufacturing'));assert.ok(industrySectorKeys.includes('energy'));
 assert.equal(classifyArticle(article('NVIDIA unveils new GPU chip')).sector,'semiconductor');
 assert.equal(classifyArticle(article('机器人企业新增工业设备订单')).sector,'manufacturing');
 assert.equal(classifyArticle(article('大型电网储能项目投产')).sector,'energy');
 assert.equal(classifyArticle(article('促进文化产业和旅游消费')).sector,'tourism');
 assert.equal(classifyArticle(article('消费品牌上线电商渠道')).sector,'consumer');
 assert.equal(classifyArticle(article('人工智能+软件行动方案')).sector,'ai');
});
test('官方统计仍归宏观，产业新闻不会只因发布机构含工业二字被误归制造',()=>{
 assert.equal(classifyArticle(article('制造业 PMI 发布','国家统计局')).sector,'macro');
 assert.equal(classifyArticle(article('美国 CPI inflation release','美国劳工统计局')).sector,'macro');
 assert.equal(classifyArticle(article('人工智能软件新政策','工业和信息化部')).sector,'ai');
 assert.equal(classifyArticle(article('消费品工业发展政策','工业和信息化部')).sector,'consumer');
 assert.equal(classifyArticle(article('Henry Hub natural gas prices were lower','美国能源信息署 EIA · 能源观察','https://www.eia.gov/todayinenergy/detail.php?id=1')).sector,'energy');
});
test('官方发布归属优先于双边标题提到的其他国家',()=>{
 assert.equal(classifyArticle(article('中美经贸磋商在美国纽约举行','商务部 · 新闻发布')).region,'china');
 assert.equal(classifyArticle(article('Japan and U.S. issue supply chain statement','日本经济产业省 METI')).region,'japan');
 assert.equal(classifyArticle(article('Supplementary pensions policy','欧洲委员会 · 金融政策','https://finance.ec.europa.eu/news/a')).region,'europe');
 assert.equal(classifyArticle(article('Investment position release','美国经济分析局 BEA')).region,'us');
 assert.equal(classifyArticle(article('美联储政策利率调整','媒体')).region,'us');
});
test('产业全球聚合所有地区，宏观地区代码仍可保持原有查询语义',()=>{
 assert.equal(industryRegionQuery('china'),'china');assert.equal(industryRegionQuery('us'),'us');
 for(const region of [undefined,'global','europe','japan','invalid'])assert.equal(industryRegionQuery(region),undefined);
});
test('BEA embargo 发布时间来自明确字段，不挪用正文统计期或正文日期',()=>{
 assert.equal(extractPublishedDate('<div class="row release-embargo">EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, Thursday, September 24, 2026</div><article>Data for June 30, 2026</article>'),'2026-09-24');
 assert.equal(extractPublishedDate('<article>Released September 24, 2026 for quarter ending June 30, 2026</article>'),null);
 assert.equal(extractPublishedDate('<div class="release-embargo">EMBARGOED UNTIL RELEASE AT February 30, 2026</div>'),null);
 assert.equal(extractPublishedDate('<meta name="date" content="2026-02-30">'),null);
});
