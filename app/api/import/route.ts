import { NextRequest, NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/fetcher';
import db from '@/lib/db';
import {mergeStagedArticles} from '@/pipeline/import';
import {syncStories} from '@/lib/stories';
import { isLocalMutation } from '@/lib/local-request';
import { isSafeUrl } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isLocalMutation(req)) return NextResponse.json({ ok: false, error: '请从本地收件箱操作。' }, { status: 403 });
  try {
    const { url, note } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ ok: false, error: 'URL 不能为空' }, { status: 400 });
    }
    const check = await isSafeUrl(url);
    if (!check.safe) {
      return NextResponse.json({ ok: false, error: check.reason || '链接不安全' }, { status: 400 });
    }
    if (db.prepare('SELECT id FROM staged_articles WHERE url = ?').get(url)) {
      return NextResponse.json({ ok: false, error: 'URL 已存在于收件箱' }, { status: 409 });
    }
    const { title, text, isSPA } = await fetchArticle(url);
    if (isSPA) {
      return NextResponse.json({
        ok: false,
        error: '该页面为动态加载，暂无法稳定提取正文；请换可访问的原文或稍后补充站点适配。',
        title,
      }, { status: 422 });
    }
    const staged=db.prepare(`
      INSERT INTO staged_articles (url, title, source_note, raw_text, staged_at, merged_at, status)
      VALUES (?, ?, ?, ?, ?, NULL, 'pending')
    `).run(url, title, typeof note === 'string' ? note.slice(0, 500) : null, text, new Date().toISOString());
    await mergeStagedArticles(Number(staged.lastInsertRowid));
    const article=db.prepare('SELECT id FROM articles WHERE url=?').get(url);
    if(article)syncStories([Number(article.id)]);
    return NextResponse.json({ ok: true, title, textLength: text.length, articleId:article?.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || '导入失败' }, { status: 500 });
  }
}