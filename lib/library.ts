import db from './db';
export type LibraryItem = {
  id: number; title: string; url: string; publisher: string | null; author: string | null;
  published_at: string | null; fetched_at: string; source_tier: string | null; is_primary: number;
  judgment: string | null; summary: string | null; excerpt: string; tags: string | null; stance: string | null;
  saved: number; note: string | null; horizon: string | null;
};
export type LibraryQuery = { q?: string; topic?: string; stance?: string; page?: string; saved?: string; period?: string };
export function getLibrary(query: LibraryQuery = {}, savedOnly = false) {
  query = Object.fromEntries(Object.entries(query).filter(([, value]) => typeof value === 'string'));
  const conditions: string[] = []; const args: (string | number)[] = [];
  if (savedOnly || query.saved === '1') conditions.push('n.saved = 1');
  if (query.q?.trim()) {
    conditions.push("instr(lower(a.title || ' ' || COALESCE(a.publisher,'') || ' ' || COALESCE(s.summary,'') || ' ' || COALESCE(n.note,'')), lower(?)) > 0");
    args.push(query.q.trim().slice(0, 120));
  }
  if (query.topic) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(s.tags) THEN s.tags ELSE '[]' END) WHERE value = ?)");
    args.push(query.topic);
  }
  if (['bullish', 'bearish', 'neutral'].includes(query.stance || '')) { conditions.push('s.stance = ?'); args.push(query.stance!); }
  if (['long', 'short', 'knowledge'].includes(query.period || '')) { conditions.push('n.horizon = ?'); args.push(query.period!); }
  const from = 'FROM articles a LEFT JOIN summaries s ON s.article_id = a.id LEFT JOIN research_notes n ON n.article_id = a.id';
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const total = Number(db.prepare('SELECT count(*) n ' + from + where).get(...args)?.n || 0);
  const pages = Math.max(1, Math.ceil(total / 15));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page || '1', 10) || 1));
  const items = db.prepare("SELECT a.id,a.title,a.url,a.publisher,a.author,a.published_at,a.fetched_at,a.source_tier,a.is_primary,(SELECT content FROM article_judgments j WHERE j.article_id=a.id) judgment,s.summary,s.tags,s.stance,substr(COALESCE(a.raw_text,''),1,500) excerpt,COALESCE(n.saved,0) saved,n.note,n.horizon " + from + where +
    ' ORDER BY a.id DESC LIMIT 15 OFFSET ?').all(...args, (page - 1) * 15) as LibraryItem[];
  const topics = db.prepare("SELECT DISTINCT j.value topic FROM summaries s,json_each(CASE WHEN json_valid(s.tags) THEN s.tags ELSE '[]' END) j ORDER BY j.value").all().map(r => String(r.topic));
  return { items, total, page, pages, topics };
}
