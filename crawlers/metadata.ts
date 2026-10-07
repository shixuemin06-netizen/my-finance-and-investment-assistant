import * as cheerio from 'cheerio';
export function extractPublishedDate(html:string):string|null {
  const $=cheerio.load(html);const candidates:string[]=[];
  for(const selector of ['meta[property="article:published_time"]','meta[name="publishdate"]','meta[name="pubdate"]','meta[name="date"]','meta[name="publish_date"]','meta[name="PubDate"]']) {const v=$(selector).attr('content');if(v)candidates.push(v);}
  function walk(obj:any){if(!obj||typeof obj!=='object')return;if(typeof obj.datePublished==='string')candidates.push(obj.datePublished);if(Array.isArray(obj))obj.forEach(walk);else if(obj['@graph'])walk(obj['@graph']);}
  $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()))}catch{}});
  const time=$('time[datetime]').first().attr('datetime');if(time)candidates.push(time);
  // Only timestamp-specific elements, never dates mentioned in article body.
  const stamp=$('.publish-time,.pubtime,.detail-time,.source .time,.info .time,.detail-info .time').first().text();if(stamp)candidates.push(stamp);
  // BEA identifies the official release date in its embargo banner, not body dates.
  $('.release-embargo').each((_,el)=>{const v=$(el).text().trim();if(/^EMBARGOED UNTIL RELEASE AT\b/i.test(v))candidates.push(v);});
  $('.detail-info > span').each((_,el)=>{const v=$(el).text().trim();if(/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v))candidates.push(v);});
  for(const value of candidates){
    const english=value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    const m=value.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/) || (english?['',english[3],String(months.indexOf(english[1].toLowerCase())+1),english[2]]:null);if(!m)continue;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);const dt=new Date(Date.UTC(y,mo-1,d));
    if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d&&dt.getTime()<=Date.now()+86400000)return [m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-');
  }
  return null;
}
