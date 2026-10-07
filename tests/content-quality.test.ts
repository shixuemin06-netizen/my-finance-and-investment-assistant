import {test} from 'node:test';import assert from 'node:assert/strict';
import {assessContentQuality,sourceExcerpt} from '../lib/content-quality';
const title='晶硅电池转换效率提升，光伏产业进入调整期';
const body='据企业发布信息，晶硅电池转换效率提升，光伏产业进入调整期。第三方实验室检测的效率数据反映实验条件，不能直接推断全行业量产盈利。'+
'光伏制造企业持续调整产能和设备投入。需求恢复、设备良率以及技术商业化进展是后续核验重点。行业当前仍承受价格压力，研发纪录与实际产能利用率应分别考察。';
const row={title,url:'https://example.org/news/1',raw_text:body};
test('不足正文不会生成判断，错位摘要进入复核，正确摘要不靠填充模板',()=>{
 assert.equal(assessContentQuality({...row,raw_text:title}).canGenerate,false);
 assert.equal(assessContentQuality({...row,raw_text:''}).status,'review');
 const wrong=assessContentQuality({...row,summary:'中际旭创宣布回购股票，公司已经花费五十亿元，公司董事会认为回购有助于员工股权激励，通信行业资金持续外流。'});
 assert.equal(wrong.status,'review');assert.ok(wrong.reasons.includes('summary_not_supported_by_body'));
 assert.equal(assessContentQuality({...row,summary:'晶硅电池转换效率提升，但技术商业化进展及设备良率仍需核验，光伏行业承受价格压力。'}).status,'accepted');
});
test('页面列表结构及保存正文覆盖共同决定发布门槛',()=>{
 const raw_html='<html><head><title>'+title+'</title></head><body><h1>'+title+'</h1><main><article><p>'+body+'</p></article></main><aside><a href="/news/2">中际旭创回购</a></aside></body></html>';
 assert.equal(assessContentQuality({...row,raw_html}).status,'accepted');
 assert.equal(assessContentQuality({...row,raw_html,raw_text:'中际旭创宣布回购，资金外流。'.repeat(12)}).status,'review');
});
test('依据指纹改变后旧生成内容隔离，摘录选择主题对应原文段落',()=>{
 assert.equal(assessContentQuality({...row,summary:'光伏产业进入调整期，需观察设备良率。',source_fingerprint:'stale'}).status,'review');
 assert.ok(sourceExcerpt(row).includes('光伏'));
});

test('English source excerpt skips the headline without its author prefix and the speech byline',()=>{
 const title='Boris Vujčić: Resilience, integration and competitiveness: building the future of European banking';
 const headline='Resilience, integration and competitiveness: building the future of European banking';
 const byline='Keynote speech by Boris Vujčić, Vice-President of the ECB, at the annual European banking conference';
 const paragraph='European banking resilience and competitiveness support the future of financial integration. Estimates put the median fiscal cost of a banking crisis at around 7% of GDP for advanced economies.';
 const excerpt=sourceExcerpt({title,url:'https://www.ecb.europa.eu/press/example',raw_text:[headline,byline,paragraph].join('\n\n')},1_000);
 assert.equal(excerpt,paragraph);
 assert.ok(excerpt.includes('7% of GDP'));
});

test('Chinese source excerpt removes repeated long headings while preserving the exact statistical statement',()=>{
 const title='国家统计局：2026年9月中国非制造业采购经理指数运行情况及分行业景气表现';
 const subtitle='2026年9月中国非制造业采购经理指数运行情况及分行业景气表现';
 const paragraph='9月份，非制造业商务活动指数为50.2%，比上月上升1.2个百分点，非制造业景气水平明显回升。建筑业商务活动指数为49.4%，服务业商务活动指数为50.3%。';
 const excerpt=sourceExcerpt({title,url:'https://www.stats.gov.cn/release',raw_text:title+'\n\n'+subtitle+'\n\n53.8\u2002\u3000\u3000'+paragraph},1_000);
 assert.equal(excerpt,paragraph);
 for(const value of ['50.2%','1.2个百分点','49.4%','50.3%'])assert.ok(excerpt.includes(value));
});
