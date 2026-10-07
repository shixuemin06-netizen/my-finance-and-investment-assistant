import { auditExtractedText, extractArticleHtml, titleBodyCoverage } from './extraction-quality';
import { contentFingerprint } from './content-fingerprint';
import { classifyArticle, type StoryArticle } from './story-classification';

export const QUALITY_RULE_VERSION='public-quality-v1';
export type QualityInput = Omit<Partial<StoryArticle>,'is_primary'> & {is_primary?:number|boolean|null;title:string;url:string;raw_text?:string|null;raw_html?:string|null;summary?:string|null;judgment?:string|null;source_fingerprint?:string|null};
export type ContentQuality={status:'accepted'|'review';canGenerate:boolean;reasons:string[];fingerprint:string;bodyChars:number;pageType:string;summaryCoverage:number|null};
/** Signals require a substantive body AND structural/title checks. They are a review gate, not proof of truth. */
export function assessContentQuality(input:QualityInput):ContentQuality{
 const body=input.raw_text?.trim()||'';
 const audit=auditExtractedText({title:input.title,raw_text:body,url:input.url});
 const reasons=[...audit.reasons];
 if(input.raw_html&&/<(?:html|body|h1)\b/i.test(input.raw_html)){
  const structure=extractArticleHtml(input.raw_html,{url:input.url,expectedTitle:input.title});
  if(structure.status==='review')reasons.push(...structure.reasons.map(reason=>'page_'+reason));
  // A stored body must cover the selected article, not only neighbouring recommendations.
  if(structure.status==='accepted'&&textCoverage(structure.text,body)<.45)reasons.push('extracted_body_not_article');
 }
 if(body.replace(/\s/g,'').length<120&&!reasons.includes('insufficient_body'))reasons.push('insufficient_body');
 const fingerprint=contentFingerprint(input);
 const canGenerate=reasons.length===0;
 const summary=input.summary?.trim()||'';
 let summaryCoverage:number|null=null;
 if(summary){
  // Cross-language summaries cannot be judged by lexical overlap.
  const sameLanguage=/[\u3400-\u9fff]/u.test(summary)===/[\u3400-\u9fff]/u.test(body);
  if(sameLanguage){summaryCoverage=textCoverage(summary,body);if(summary.length>45&&summaryCoverage<.2)reasons.push('summary_not_supported_by_body');
   const headline=input.title.split(/[，,:：!！]/u)[0];
   if(summary.length>=24&&headline.length>=8&&titleBodyCoverage(headline,body)>.55&&titleBodyCoverage(headline,summary)<.1)reasons.push('summary_title_subject_mismatch');
  }

 }
 if((summary||input.judgment)&&input.source_fingerprint&&input.source_fingerprint!==fingerprint)reasons.push('generation_basis_changed');
 // Model tags cannot supply the only evidence for a specialist classification.
 if(input.tags&&canGenerate){
  const row={...input,id:input.id||0,fetched_at:input.fetched_at||'',tags:null} as StoryArticle;
  const grounded=classifyArticle(row),withTags=classifyArticle({...row,tags:input.tags});
  if(withTags.sector!==grounded.sector&&!sectorHasEvidence(withTags.sector,row.title+' '+body))reasons.push('classification_without_material_basis');
 }
 return {status:reasons.length?'review':'accepted',canGenerate,reasons:[...new Set(reasons)],fingerprint,bodyChars:body.length,pageType:audit.pageType,summaryCoverage};
}
function tokens(text:string):string[]{
 const normalized=text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 if(/[\u3400-\u9fff]/u.test(text)){const chars=normalized.replace(/[^\p{L}\p{N}]/gu,'');return Array.from({length:Math.max(0,chars.length-1)},(_,i)=>chars.slice(i,i+2));}
 return text.toLowerCase().match(/[a-z]{3,}|\d+(?:\.\d+)?/g)||[];
}
export function textCoverage(subject:string,basis:string):number{
 const wanted=new Set(tokens(subject)),available=new Set(tokens(basis));if(!wanted.size)return 0;
 return [...wanted].filter(token=>available.has(token)).length/wanted.size;
}
export function sourceExcerpt(input:QualityInput,max=180):string{
 // Extracted article containers can include their headline and speech byline.
 // Match those conservatively; normalization is for selection only, never for the quoted output.
 const headingKey=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 const headings=[input.title,...Array.from(input.title.matchAll(/[:：]/g),match=>input.title.slice(match.index!+1))].map(headingKey).filter(value=>value.length>=12);
 const isHeading=(text:string)=>{const key=headingKey(text.replace(/^(?:[一二三四五六七八九十百]+|\d{1,2})[、.．)）]\s*/,''));return headings.some(title=>key===title||(title.endsWith(key)&&key.length>=title.length*.7));};
 const byline=/^(?:(?:keynote|opening|closing|welcome)\s+)?(?:speech|remarks|address|presentation)\s+by\b|^(?:作者|来源|发布日期|发布时间)\s*[:：]/i;
 const paragraphs=(input.raw_text||'').split(/\n+|[\u2000-\u200a\u3000]{2,}/).map(p=>p.trim()).filter(p=>p.length>=35&&!/责任编辑|下载.*APP|不构成.*投资建议/.test(p)&&!isHeading(p)&&!byline.test(p));
 const ranked=paragraphs.map((text,index)=>({text,index,coverage:textCoverage(input.title,text)})).sort((a,b)=>b.coverage-a.coverage||a.index-b.index);
 const value=ranked[0]?.text||'';return value.length>max?value.slice(0,max)+'…':value;
}
export function groundedClassification(input:QualityInput){
 const classified=classifyArticle({...input,id:input.id||0,fetched_at:input.fetched_at||'',tags:null} as StoryArticle);
 // An unidentified English publication should not silently default to China.
 if(classified.region==='china'&&!/[\u3400-\u9fff]/u.test(input.title)&&!/[\u3400-\u9fff]/u.test(input.publisher||''))classified.region='global';
 return classified;
}

export function sectorHasEvidence(sector:string,text:string):boolean{
 const patterns:Record<string,RegExp>={
 macro:/央行|人民银行|美联储|货币政策|财政|宏观|经济数据|国债|汇率|GDP|CPI|PMI|FOMC|inflation|monetary|interest rate|employment|贸易|经贸|关税|国事访问|中美.*(?:共识|会谈|会晤|访问)/i,
 semiconductor:/芯片|半导体|集成电路|晶圆|光刻|封装|英伟达|台积电|中芯国际|GPU|TSMC|NVIDIA|semiconductor|wafer|lithograph/i,
 energy:/新能源|光伏|锂电|电动车|新能源汽车|储能|电池|氢能|能源|电力|电网|发电|核电|风电|充电|油气|天然气|石油|renewable|battery|solar|electricity|natural gas|crude oil|energy/i,
 tourism:/文旅|旅游|文化产业|文创|酒店|非遗|景区|tourism|hospitality/i,
 consumer:/新消费|消费品牌|消费品|零售|电商|餐饮|食品|饮料|服装|化妆品|潮玩|retail|e-commerce|consumer brand|food industry/i,
 manufacturing:/机器人|制造|工业|航空|航天|机床|装备|机械|卫星|激光|自动驾驶|robotics?|manufactur|aerospace|machinery|automation|satellite/i,
 ai:/人工智能|算力|大模型|数据中心|通信|软件|网络|\bAI\b|OpenAI|Anthropic|Kimi|量子|telecom|software|quantum|data cent(?:er|re)/i,
 };
 return sector==='general'||Boolean(patterns[sector]?.test(text));
}
