export function beijingDay(value:string){const time=Date.parse(value);return Number.isFinite(time)?new Date(time+8*3600000).toISOString().slice(0,10):null;}
export function overviewWindow<T extends {published_at:string|null;latest_at:string}>(items:T[],now=Date.now()){
 const eligible=items.filter(s=>s.published_at&&Date.parse(s.latest_at)<=now);
 const today=beijingDay(new Date(now).toISOString())!;
 const daily=eligible.filter(s=>beijingDay(s.latest_at)===today);
 if(daily.length)return {items:daily,label:'今日发布',day:today,historical:false};
 const recent=eligible.filter(s=>Date.parse(s.latest_at)>=now-72*3600000);
 if(recent.length)return {items:recent,label:'最近 72 小时',day:today,historical:false};
 const day=eligible.map(s=>beijingDay(s.latest_at)!).sort().at(-1);
 return {items:day?eligible.filter(s=>beijingDay(s.latest_at)===day):[],label:day?'最近发布 · '+day:'暂无已核实日期的发布',day:day||today,historical:true};
}
