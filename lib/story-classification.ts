import { createHash } from 'node:crypto';
export const regions = { china:'中国', us:'美国', europe:'欧洲', japan:'日本', global:'全球' } as const;
export const sectors = { macro:'宏观趋势', ai:'AI 与数字科技', semiconductor:'半导体', manufacturing:'先进制造', energy:'能源与电力', tourism:'文旅产业', consumer:'新消费', general:'市场观察' } as const;
export const industrySectorKeys = ['ai','semiconductor','manufacturing','energy','tourism','consumer'] as const;
export function industryRegionQuery(region?:string){return region==='china'||region==='us'?region:undefined;}
export const themes = { monetary:'政策与利率', growth:'增长与就业', prices:'物价与消费', trade:'贸易与资本流动', industry:'产业变化', general:'综合观察' } as const;
export type StoryArticle = { id:number;title:string;url:string;canonical_url?:string|null;publisher?:string|null;published_at?:string|null;fetched_at:string;source_tier?:string|null;is_primary?:number|null;summary?:string|null;tags?:string|null;title_zh?:string|null };
export function classifyArticle(a:StoryArticle) {
 const publisher=a.publisher||'',t=a.title+' '+(a.tags||'');
 let host='';try{host=new URL(a.canonical_url||a.url).hostname;}catch{}
 // Official origin wins over countries mentioned in a bilateral announcement.
 const officialRegion:keyof typeof regions|undefined=/美联储|美国劳工统计局|美国经济分析局|美国能源信息署|Federal Reserve|Bureau of (Economic|Labor)|Energy Information Administration/i.test(publisher)||/\b(?:bea|bls|eia|federalreserve)\.gov$/.test(host)?'us':
  /欧洲央行|欧洲统计局|欧洲委员会|European Central|Eurostat|European Commission/i.test(publisher)||/(?:^|\.)ec\.europa\.eu$|(?:^|\.)ecb\.europa\.eu$/.test(host)?'europe':
  /日本央行|日本统计局|日本经济产业省|Bank of Japan|Statistics Bureau of Japan|\bMETI\b/i.test(publisher)||/(?:^|\.)(?:boj\.or\.jp|stat\.go\.jp|meti\.go\.jp)$/.test(host)?'japan':
  /国际货币|世界银行|\bIMF\b|World Bank/i.test(publisher)||/(?:^|\.)(?:imf\.org|worldbank\.org)$/.test(host)?'global':
  /人民银行|国家统计局|证监会|商务部|工业和信息化部|文化和旅游部/.test(publisher)?'china':undefined;
 const region:keyof typeof regions=officialRegion||(/美联储|美国|美股|Federal Reserve|FOMC|\bU\.?S\.?\b/i.test(t)?'us':/欧洲|欧元|欧盟|ECB|Eurostat|European Central/i.test(t)?'europe':/日本|日央行|Bank of Japan|\bBOJ\b/i.test(t)?'japan':/IMF|国际货币|全球|世界银行|World Bank|global outlook/i.test(t)?'global':'china');
 const specific:keyof typeof sectors|undefined=/芯片|半导体|集成电路|晶圆|光刻|封装|英伟达|台积电|中芯国际|\bGPU\b|\bTSMC\b|NVIDIA|semiconductor|chipmaker|wafer|lithograph/i.test(t)?'semiconductor':
  /新能源|光伏|锂电|电动车|新能源汽车|储能|电池|氢能|能源|电力|电网|发电|核电|风电|充电|电气化|油气|天然气|石油|renewable|battery|solar|electricity|power grid|natural gas|crude oil|energy/i.test(t)||/美国能源信息署|Energy Information Administration/i.test(publisher)||/(?:^|\.)eia\.gov$/.test(host)?'energy':
  /文旅|旅游|文化产业|文创|酒店|非遗|景区|tourism|travel industry|hospitality/i.test(t)||/文化和旅游部/.test(publisher)?'tourism':
  /新消费|消费品牌|消费品|零售|电商|餐饮|食品|饮料|服装|化妆品|潮玩|轻工纺织|retail|e-commerce|consumer brand|food industry/i.test(t)?'consumer':
  /机器人|制造|工业|航空|航天|机床|装备|机械|卫星|激光|自动驾驶|智能网联|robotics?|manufactur|aerospace|machinery|automation|satellite|industrial equipment/i.test(t)?'manufacturing':
  /人工智能|算力|大模型|数据中心|通信|软件|网络|\bAI\b|OpenAI|Anthropic|Kimi|量子|telecom|software|quantum|data cent(?:er|re)/i.test(t)?'ai':undefined;
 const macroPublisher=/央行|人民银行|美联储|国家统计局|美国劳工统计局|美国经济分析局|日本统计局|欧洲统计局|欧洲委员会 · 金融|Federal Reserve|Eurostat|Bank of Japan|ECB|IMF|Bureau of (Economic|Labor)|Statistics Bureau/i.test(publisher);
 const macroTitle=/国事访问|中美.*(?:共识|会谈|会晤|访问)|地缘政治|央行|人民银行|美联储|财政|宏观|经济数据|货币政策|国债|逆回购|汇率|\bGDP\b|\bCPI\b|\bPMI\b|FOMC|inflation|monetary|interest rate|employment|unemployment|gross domestic|关税|贸易|经贸|外资|tariff|international trade|investment position/i.test(t);
 const sector:keyof typeof sectors=macroPublisher?'macro':specific|| (macroTitle?'macro':/工业和信息化部/.test(publisher)?'manufacturing':'general');
 const theme:keyof typeof themes=sector!=='macro'&&sector!=='general'?'industry':/利率|降息|降准|央行|美联储|货币|财政|逆回购|monetary|interest rate|FOMC/i.test(t)?'monetary':/物价|通胀|消费|\bCPI\b|\bPPI\b|inflation|consumer/i.test(t)?'prices':/贸易|关税|出口|进口|汇率|trade|tariff|exchange rate/i.test(t)?'trade':/增长|就业|GDP|PMI|失业|growth|employment|gross domestic/i.test(t)?'growth':sector!=='macro'&&sector!=='general'?'industry':'general';
 return {region,sector,theme};
}
/** A topic or a month alone cannot identify an event. */
export function eventKey(a:StoryArticle):string {
 const title=a.title.normalize('NFKC');
 const entity=/美联储|Federal Reserve|FOMC/i.test(title)?'fed':/欧洲央行|ECB/i.test(title)?'ecb':/日本央行|Bank of Japan|BOJ/i.test(title)?'boj':'';
 const date=title.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})(?:日|号)?/);
 if(entity&&date&&/议息|利率决议|降息|加息|维持利率|rate decision|cuts? rates?|raises? rates?/i.test(title)){
  const value=date[1]+'-'+date[2].padStart(2,'0')+'-'+date[3].padStart(2,'0');
  if(Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)return 'policy:'+entity+':'+value;
 }
 try{const u=new URL(a.canonical_url||a.url);u.hash='';['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k=>u.searchParams.delete(k));return 'url:'+u.href;}catch{return 'article:'+a.id;}
}
export function storyId(key:string){return createHash('sha256').update(key).digest('hex').slice(0,24);}
export function publicationTime(a:StoryArticle){return a.published_at&&Number.isFinite(Date.parse(a.published_at))?a.published_at:a.fetched_at;}
