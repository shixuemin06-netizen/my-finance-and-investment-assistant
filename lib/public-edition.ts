import { eventKey, storyId, type StoryArticle } from './story-classification';
import { validateJudgment, type Judgment } from './judgment';
import { assessContentQuality, groundedClassification, sourceExcerpt } from './content-quality';
import { groupEventArticles } from './event-grouping';
export type PublicInputArticle = StoryArticle & {
 source_type:string|null;raw_text?:string|null;raw_html?:string|null;judgment?:string|null;
 source_fingerprint?:string|null;basis_kind?:string|null;generation_at?:string|null;summary_generated_at?:string|null;
};
export type PublicInputDigest={date:string;article_ids:string|null;generated_at:string};
export type PublicArticle={
 id:number;title:string;originalTitle:string|null;topicLabel:string;summary:string|null;factExcerpt:string;
 judgment:Judgment|null;publishedAt:string|null;fetchedAt:string|null;
 region:string;sector:string;theme:string;publisher:string;sourceTier:string;sourceRole:string;
 url:string;eventId:string;generatedAt:string|null;basisKind:string;basisFingerprint:string;oldEventId:string;
};
export type PublicEvent={
 id:string;title:string;articleIds:number[];representativeArticleId:number;region:string;sector:string;theme:string;
 firstAt:string|null;latestAt:string|null;sourceFamilyCount:number;independence:string;
};
export type PublicIssue={date:string;articleIds:number[];generatedAt:string|null};
export type PublicEdition={
 snapshotAt:string;contentUpdatedAt:string|null;articles:PublicArticle[];events:PublicEvent[];issues:PublicIssue[];
};
/** Reject local, credential-bearing and signed/private-looking URLs before publication. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (host.includes(':') || !host.includes('.')) return null;
    url.hostname = host;
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host === '::1' || host === '::' || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
          (a === 100 && b >= 64 && b <= 127)) return null;
    }
    if (host.startsWith('::ffff:')) return null;
    for (const key of url.searchParams.keys()) if (/^(?:api[_-]?key|key|token|access[_-]?token|auth|authorization|password|secret|signature|sig|x-amz-credential|x-amz-signature|x-amz-security-token|x-goog-credential|x-goog-signature)$/i.test(key)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function validTime(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && (!/^\d{4}-\d{2}-\d{2}/.test(value) || validDay(value.slice(0, 10))) ? value : null;
}
function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function publicIds(value: string | null, allowed: Set<number>): number[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is number =>
      typeof id === 'number' && Number.isSafeInteger(id) && allowed.has(id)))] : [];
  } catch { return []; }
}

/** Public export recomputes all gates; it never trusts stale persisted approval. */
export function buildPublicEdition(rows:PublicInputArticle[],digests:PublicInputDigest[],snapshotAt=new Date().toISOString()):PublicEdition{
 const articles:PublicArticle[]=[],accepted:PublicInputArticle[]=[];
 const seen=new Set<number>();
 for(const row of rows){
  const url=publicSourceUrl(row.url);
  if(row.source_type!=='crawled'||!url||!Number.isSafeInteger(row.id)||row.id<=0||seen.has(row.id))continue;
  seen.add(row.id);
  const quality=assessContentQuality(row);if(quality.status!=='accepted')continue;
  const classified=groundedClassification(row);
  let judgment:Judgment|null=null;
  try{const checked=quality.canGenerate?validateJudgment(JSON.parse(row.judgment||'null'),row.raw_text||''):null;
   if(checked)judgment={thesis:checked.thesis,mechanism:checked.mechanism,evidence:checked.evidence,counterpoint:checked.counterpoint,watch:checked.watch,horizon:checked.horizon,
    ...(checked.direction&&checked.asset&&checked.conditions?{direction:checked.direction,asset:checked.asset,conditions:checked.conditions}:{})};
  }catch{}
  const translated=typeof row.title_zh==='string'&&row.title_zh.trim()?row.title_zh.trim():null;
  const tier=row.source_tier==='official'?'official':row.source_tier==='community'?'community':'media';
  const oldEventId=storyId(eventKey({...row,url,canonical_url:publicSourceUrl(row.canonical_url)||url}));
  const regionLabel=({china:'中国',us:'美国',europe:'欧洲',japan:'日本',global:'全球'} as Record<string,string>)[classified.region];
  const themeLabel=({monetary:'政策与利率',growth:'增长与就业',prices:'物价与消费',trade:'贸易与资本流动',industry:'产业变化',general:'综合观察'} as Record<string,string>)[classified.theme];
  articles.push({
   id:row.id,title:translated||row.title,originalTitle:translated&&translated!==row.title?row.title:null,
   topicLabel:regionLabel+' · '+themeLabel,summary:row.summary?.trim()||null,factExcerpt:sourceExcerpt(row),
   judgment,publishedAt:validTime(row.published_at),fetchedAt:validTime(row.fetched_at),...classified,
   publisher:row.publisher||'来源未标注',sourceTier:tier,sourceRole:tier==='official'?(/新华社|转载自|来源[:：]\s*(?:新华网|Reuters)/i.test((row.raw_text||'').slice(0,350))?'官方网站转载':'官方发布'):tier==='community'?'社区观点':'媒体转述',
   url,eventId:oldEventId,oldEventId,generatedAt:validTime(row.generation_at||row.summary_generated_at),
   basisKind:row.basis_kind==='generated'?'generated':row.summary?'legacy_audited':'source_only',basisFingerprint:quality.fingerprint,
  });
  accepted.push({...row,url,canonical_url:publicSourceUrl(row.canonical_url)||url});
 }
 const grouping=groupEventArticles(accepted),byId=new Map(articles.map(a=>[a.id,a]));
 const events:PublicEvent[]=grouping.groups.map(g=>{
  const representative=byId.get(g.representativeArticleId)!;
  const members=g.articleIds.map(id=>byId.get(id)!);
  for(const article of members)article.eventId=g.id;
  const dated=members.map(a=>a.publishedAt).filter((at):at is string=>Boolean(at)).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return{id:g.id,title:representative.title,articleIds:g.articleIds,representativeArticleId:g.representativeArticleId,
   region:representative.region,sector:representative.sector,theme:representative.theme,
   firstAt:dated[0]||null,latestAt:dated[dated.length-1]||null,sourceFamilyCount:g.sourceFamilyCount,independence:g.independence};
 });
 articles.sort((a,b)=>Date.parse(b.publishedAt||b.fetchedAt||'')-Date.parse(a.publishedAt||a.fetchedAt||'')||b.id-a.id);
 const allowed=new Set(articles.map(a=>a.id));
 const issues=digests.filter(d=>validDay(d.date)).map(d=>({date:d.date,articleIds:publicIds(d.article_ids,allowed),generatedAt:validTime(d.generated_at)})).filter(d=>d.articleIds.length).sort((a,b)=>b.date.localeCompare(a.date));
 const contentUpdatedAt=articles.map(a=>a.fetchedAt).filter((at):at is string=>Boolean(at)).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 return{snapshotAt,contentUpdatedAt,articles,events:events.sort((a,b)=>Date.parse(b.latestAt||'')-Date.parse(a.latestAt||'')),issues};
}

/** Match the same region scopes as the local reader. */
export function matchesPublicRegion(kind: string, selected: string, articleRegion: string): boolean {
  if (!selected || (kind === 'industry' && selected === 'global')) return true;
  if (kind === 'macro' && selected === 'global') return articleRegion !== 'china';
  return articleRegion === selected;
}
