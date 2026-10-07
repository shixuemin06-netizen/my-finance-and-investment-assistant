import db from '@/lib/db';
import { isLocalMutation } from '@/lib/local-request';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!isLocalMutation(request)) return Response.json({ error: '请从本地网页保存。' }, { status: 403 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: '请求格式有误' }, { status: 400 }); }
  const { articleId, note, horizon, saved } = body || {};
  if (!Number.isInteger(articleId) || typeof note !== 'string' || note.length > 4000 || !['long', 'short', 'knowledge'].includes(horizon) || typeof saved !== 'boolean') {
    return Response.json({ error: '笔记最长 4000 字，请检查填写内容。' }, { status: 400 });
  }
  if (!db.prepare('SELECT id FROM articles WHERE id = ?').get(articleId)) return Response.json({ error: '材料不存在' }, { status: 404 });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO research_notes(article_id,note,horizon,saved,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET note=excluded.note,horizon=excluded.horizon,saved=excluded.saved,updated_at=excluded.updated_at')
    .run(articleId,note,horizon,Number(saved),now,now);
  return Response.json({ ok: true });
}
