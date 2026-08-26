import { NextRequest, NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/fetcher';
import { readTable, writeTable } from '@/lib/db';
import { isSafeUrl } from '@/lib/ssrf-guard';
import type { StagedArticleRow } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { url, note } = await req.json();
    if (!url) {
      return NextResponse.json({ ok: false, error: 'URL 不能为空' }, { status: 400 });
    }

    // SSRF 防护：拒绝本机/内网/非 http(s)
    const check = await isSafeUrl(url);
    if (!check.safe) {
      return NextResponse.json({ ok: false, error: check.reason || '链接不安全' }, { status: 400 });
    }

    // 查重
    const staged = readTable('staged_articles') as StagedArticleRow[];
    if (staged.some((s) => s.url === url)) {
      return NextResponse.json({ ok: false, error: 'URL 已存在' });
    }

    const { title, text, isSPA } = await fetchArticle(url);

    if (isSPA) {
      return NextResponse.json({
        ok: false,
        error: '该页面为动态加载（SPA），无法自动提取正文。请尝试粘贴其他来源的文章，或等待 Phase 2 站点适配。',
        title,
      });
    }

    staged.push({
      id: staged.length + 1,
      url,
      title,
      source_note: note || null,
      raw_text: text,
      staged_at: new Date().toISOString(),
      merged_at: null,
      status: 'pending',
    });

    writeTable('staged_articles', staged);
    return NextResponse.json({ ok: true, title, textLength: text.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || '导入失败' }, { status: 500 });
  }
}
