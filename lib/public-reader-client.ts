import { readingFreshness } from './reading-freshness';
/** Generated public-only browser program. Rendering uses DOM text nodes, never source HTML. */
export function publicReaderClientScript():string{
 return String.raw`(function(){
'use strict';
var contentFreshness=${readingFreshness.toString()};
document.querySelectorAll('[data-content-updated-at]').forEach(function(node){
 var freshness=contentFreshness(node.dataset.contentUpdatedAt||null);
 node.dataset.freshnessState=freshness.state;
 var label=node.querySelector('[data-freshness-status]');if(label)label.textContent=freshness.label;
 var message=node.querySelector('[data-freshness-message]');
 if(message&&freshness.state==='stale')message.textContent='当前是历史资料；重新发布页面不代表新增资讯。请核对原始发布日期。';
});
var root=document.documentElement,defaults={theme:'system',size:'standard',width:'standard'},prefs=defaults;
try{
 var saved=localStorage.getItem('finance-public-reading-preferences')||localStorage.getItem('finance:reading')||localStorage.getItem('finance-reading-preferences')||'{}';
 var v=JSON.parse(saved);
 prefs={theme:['light','dark','system'].indexOf(v.theme)>=0?v.theme:'system',size:v.size==='large'?'large':'standard',width:v.width==='wide'?'wide':'standard'};
}catch(e){}
function applyPreferences(){
 root.dataset.theme=prefs.theme;root.dataset.textSize=prefs.size;root.dataset.readingWidth=prefs.width;
 root.style.colorScheme=prefs.theme==='system'?'light dark':prefs.theme;
 document.querySelectorAll('[data-preference]').forEach(function(control){control.value=prefs[control.dataset.preference]||'';});
}
applyPreferences();
document.querySelectorAll('[data-preference]').forEach(function(control){
 control.addEventListener('change',function(){
  var key=control.dataset.preference,allowed={theme:['light','dark','system'],size:['standard','large'],width:['standard','wide']};
  if(!allowed[key]||allowed[key].indexOf(control.value)<0)return;
  prefs[key]=control.value;applyPreferences();
  try{var serialized=JSON.stringify(prefs);localStorage.setItem('finance-public-reading-preferences',serialized);localStorage.setItem('finance:reading',serialized);}catch(e){}
 });
});
document.querySelectorAll('[data-reference-filter]').forEach(function(control){
 var input=control.matches('input')?control:control.querySelector('input');
 if(!input)return;
 var scope=control.closest('[data-reference-section]')||document;
 input.addEventListener('input',function(){
  var q=input.value.trim().toLowerCase(),visible=0,rows=scope.querySelectorAll('[data-reference-row]');
  rows.forEach(function(row){row.hidden=!!q&&row.textContent.toLowerCase().indexOf(q)<0;if(!row.hidden)visible++;});
  var label=scope.querySelector('[data-reference-count]');if(label)label.textContent=visible+' / '+rows.length+' 篇参考材料';
 });
});
var view=document.querySelector('#page-content[data-view]')||document.querySelector('[data-view]');
var form=document.querySelector('[data-filter-form]'),results=document.querySelector('[data-public-results]');
if(!view||!form||!results){delete root.dataset.filterPending;return;}
var count=document.querySelector('[data-result-count]'),status=document.querySelector('[data-result-status]'),more=document.querySelector('[data-load-more]');
var kind=view.dataset.view,initialParams=new URLSearchParams(location.search),issueDate=initialParams.get('date'),data=null,searchIndex=[],cardCache=new Map(),dateFormatter=null,matched=[],limit=20,loading=false;
var regionLabels={china:'中国',us:'美国',europe:'欧洲',japan:'日本',global:'全球'};
var sectorLabels={macro:'宏观趋势',ai:'AI 与数字科技',semiconductor:'半导体',manufacturing:'先进制造',energy:'能源与电力',tourism:'文旅产业',consumer:'新消费',general:'市场观察'};
function control(name){var node=form.elements.namedItem(name);return node&&typeof node.value==='string'?node:null;}
var originalValues={};['q','region','sector','theme','sort'].forEach(function(name){var node=control(name);if(node){originalValues[name]=node.value;if(initialParams.has(name))node.value=initialParams.get(name).slice(0,120);}});
function textNode(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function announce(text){if(status)status.textContent=text;}
function clearForLoading(){
 results.replaceChildren();results.setAttribute('aria-busy','true');
 if(count)count.textContent='正在载入筛选结果…';if(more)more.hidden=true;
 announce('正在载入公开快照资料…');delete root.dataset.filterPending;
}
function dateText(value){if(!value||!Number.isFinite(Date.parse(value)))return '发布日期未标注';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;if(!dateFormatter)dateFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});return dateFormatter.format(new Date(value));}
function link(label,href){var a=textNode('a','',label);a.href=href;return a;}
function card(article){
 var cached=cardCache.get(article.id);if(cached)return cached;
 var outer=textNode('article','story-row public-list-row'),body=textNode('div','story-body');
 var tags=textNode('div','story-eyebrow');
 tags.append(textNode('span','',regionLabels[article.region]||'地区待核对'),textNode('span','',sectorLabels[article.sector]||'分类待核对'),textNode('span','source-role',article.sourceRole||'来源类型待核对'));
 var heading=textNode('h2',''),id=Number(article.id);
 heading.append(link(article.title||article.topicLabel||'主题待核对','/articles/'+(Number.isSafeInteger(id)&&id>0?id:'invalid')+'/'));
 body.append(tags,heading);
 if(article.topicLabel&&/[a-z]{4}/i.test(article.title||''))body.append(textNode('p','quiet-copy public-topic-label',article.topicLabel));
 var summary=textNode('p','story-summary public-list-summary');
 summary.append(textNode('span','inline-label',article.summaryKind==='source_excerpt'?'原文摘录':'模型摘要'),document.createTextNode(article.summary||'摘要待核对，请进入详情核对原始材料。'));
 body.append(summary);
 var meta=textNode('div','story-meta');
 meta.append(textNode('span','',(article.publisher||'来源未标注')+' · '+dateText(article.publishedAt)),link('阅读详情','/articles/'+id+'/'));
 if(typeof article.eventId==='string'&&/^[a-f0-9]{24}$/.test(article.eventId))meta.append(link('事件与关联报道','/events/'+article.eventId+'/'));
 body.append(meta);outer.append(body);cardCache.set(article.id,outer);if(cardCache.size>80)cardCache.delete(cardCache.keys().next().value);return outer;
}
function empty(title,copy){var section=textNode('div','empty-state');section.append(textNode('h2','',title),textNode('p','',copy));return section;}
function render(){
 var shown=matched.slice(0,limit),fragment=document.createDocumentFragment(),list=textNode('div','story-list');
 if(shown.length){shown.forEach(function(a){list.append(card(a));});fragment.append(list);}else fragment.append(empty('暂无匹配材料','本次公开快照没有符合当前条件的材料，请调整关键词或分类。'));
 results.replaceChildren(fragment);results.setAttribute('aria-busy','false');delete root.dataset.filterPending;
 if(count)count.textContent=matched.length+' 条公开材料';
 if(more)more.hidden=shown.length>=matched.length;
 announce(shown.length?'已显示 '+shown.length+' / '+matched.length+' 条，结果来自定期发布快照。':'没有匹配结果。');
}
function formValue(name){var node=control(name);return node?node.value:'';}
function syncUrl(){
 var next=new URLSearchParams();['q','region','sector','theme','sort'].forEach(function(name){var value=formValue(name);if(value)next.set(name,value);});
 if(issueDate)next.set('date',issueDate);
 history.replaceState(null,'',location.pathname+(next.toString()?'?'+next.toString():''));
}
function matchRegion(region,articleRegion){if(!region||(kind==='industry'&&region==='global'))return true;if(kind==='macro'&&region==='global')return articleRegion!=='china';return region===articleRegion;}
function lower(value){return typeof value==='string'?value.toLowerCase():'';}
function buildSearchIndex(articles){
 return articles.map(function(article){
  var title=(lower(article.title)+' '+lower(article.originalTitle)).trim(),summary=lower(article.summary),publisher=lower(article.publisher),topic=lower(article.topicLabel),time=Date.parse(article.publishedAt||'');
  return {article:article,title:title,summary:summary,publisher:publisher,topic:topic,allText:title+' '+summary+' '+publisher+' '+topic,publishedRank:Number.isFinite(time)?time:-Infinity};
 });
}
function relevance(index,q,tokens){
 if(!q)return 0;
 var score=0;
 for(var i=0;i<tokens.length;i++){var term=tokens[i];if(index.allText.indexOf(term)<0)return -1;score+=(index.title.indexOf(term)>=0?100:0)+(index.publisher.indexOf(term)>=0?25:0)+(index.topic.indexOf(term)>=0?15:0)+(index.summary.indexOf(term)>=0?8:0);}
 if(index.title===q)score+=100;return score;
}
function filter(update){
 if(update)syncUrl();clearForLoading();if(!data)return;
 var q=formValue('q').trim().toLowerCase(),tokens=q.split(/\s+/).filter(Boolean),region=formValue('region'),sector=formValue('sector'),theme=formValue('theme'),sort=formValue('sort')||'relevance',allowed=null;
 if(issueDate){var issue=data.issues.find(function(x){return x.date===issueDate;});allowed=new Set(issue?issue.articleIds:[]);}
 var ranked=[];
 searchIndex.forEach(function(index){
  var article=index.article;
  if(kind==='macro'&&article.sector!=='macro')return;
  if(kind==='industry'&&(article.sector==='macro'||article.sector==='general'))return;
  if(allowed&&!allowed.has(article.id))return;
  if(!matchRegion(region,article.region)||(sector&&article.sector!==sector)||(theme&&article.theme!==theme))return;
  var score=relevance(index,q,tokens);if(score<0)return;ranked.push({article:article,score:score,publishedRank:index.publishedRank});
 });
 ranked.sort(function(a,b){
  if(sort==='relevance'&&q&&a.score!==b.score)return b.score-a.score;
  var ad=a.publishedRank,bd=b.publishedRank;if(ad!==bd)return ad>bd?-1:1;
  return b.article.id-a.article.id;
 });
 matched=ranked.map(function(x){return x.article;});limit=20;render();
}
form.addEventListener('submit',function(event){event.preventDefault();filter(true);});
form.addEventListener('change',function(){filter(true);});
form.addEventListener('input',function(event){if(event.target&&event.target.name==='q')filter(true);});
if(more)more.addEventListener('click',function(){if(!data)return;limit+=20;render();});
window.addEventListener('popstate',function(){
 var params=new URLSearchParams(location.search);issueDate=params.get('date');
 ['q','region','sector','theme','sort'].forEach(function(name){var node=control(name);if(node)node.value=params.has(name)?params.get(name):originalValues[name];});filter(false);
});
function load(){
 if(loading)return;loading=true;
 fetch('/assets/public-data.json').then(function(response){if(!response.ok)throw Error('snapshot_unavailable');return response.json();}).then(function(value){
  if(!value||!Array.isArray(value.articles)||!Array.isArray(value.issues))throw Error('snapshot_invalid');
  searchIndex=buildSearchIndex(value.articles);cardCache.clear();data=value;loading=false;filter(false);
 }).catch(function(){
  loading=false;data=null;results.replaceChildren();results.setAttribute('aria-busy','false');delete root.dataset.filterPending;
  if(count)count.textContent='结果暂不可用';if(more)more.hidden=true;
  var failure=empty('资料暂时未能载入','筛选条件已保留。可以重试载入当前快照。'),retry=textNode('button','secondary-button','重试载入');retry.type='button';
  retry.addEventListener('click',function(){clearForLoading();load();});failure.append(retry);results.append(failure);announce('筛选资料载入失败，请重试。');
 });
}
if(root.dataset.filterPending||initialParams.toString())clearForLoading();else announce('正在载入公开快照资料…');
load();
})();`;
}
