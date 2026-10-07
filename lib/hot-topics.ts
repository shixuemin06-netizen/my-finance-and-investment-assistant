import db from './db';
const topics:Record<string,RegExp>={'宏观政策':/政策|央行|货币|财政|降息|降准|经济数据/,'AI算力':/人工智能|算力|芯片|半导体|大模型|AI/iu,'海外市场':/美股|美联储|欧洲|巴西|海外|纳斯达克/,'大宗商品':/黄金|原油|有色|石油|铜价|豆粕/,'房地产':/地产|房地产|楼市|住房/,'消费':/消费|零售|白酒|食品/,'新能源':/新能源|光伏|锂电|电动车|储能/,'债市':/债券|债市|国债|收益率/,'A股大盘':/A股|沪指|创业板|上证|沪深/};
export function rankTopics(rows:Array<{id:number;title:string;publisher:string|null;url:string;fetched_at:string;tags?:string|null}>) {
  const groups=new Map<string,{topic:string;items:typeof rows;sources:Set<string>}>();
  const seen=new Set<string>();
  for(const row of rows){
    const key=row.title.replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
    if(seen.has(key))continue;seen.add(key);
    let tags:string[]=[];try{tags=JSON.parse(row.tags||'[]')}catch{}
    const matches=Object.keys(topics).filter(topic=>tags.includes(topic)||topics[topic].test(row.title)).slice(0,2);
    for(const topic of matches){const g=groups.get(topic)||{topic,items:[],sources:new Set<string>()};g.items.push(row);if(row.publisher)g.sources.add(row.publisher);groups.set(topic,g);}
  }
  return [...groups.values()].map(g=>({topic:g.topic,items:g.items,count:g.items.length,sources:g.sources.size}))
    .sort((a,b)=>b.count-a.count||b.sources-a.sources||b.items[0].id-a.items[0].id).slice(0,8);
}
export function getHotTopics(days=7) {
  const rows=db.prepare("SELECT a.id,a.title,a.publisher,a.url,a.fetched_at,s.tags FROM articles a LEFT JOIN summaries s ON s.article_id=a.id WHERE julianday(a.fetched_at)>=julianday('now',?) ORDER BY a.id DESC LIMIT 2000").all('-'+(days===1?1:7)+' days') as Parameters<typeof rankTopics>[0];
  return {topics:rankTopics(rows),count:rows.length,latest:rows[0]?.fetched_at || null};
}
