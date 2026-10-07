import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import db from '@/lib/db';
import { externalUrl, formatDate } from '@/lib/reader';
import { parseArticleIds } from '@/lib/research';
import { validateJudgment, type Judgment } from '@/lib/judgment';
import type { DigestRow } from '@/lib/types';

type DigestMaterial = {
  id: number; title: string; title_zh: string | null; publisher: string | null;
  url: string; published_at: string | null; fetched_at: string;
  raw_text: string | null; summary: string | null; judgment: string | null;
};
type DigestThesis = { material: DigestMaterial; judgment: Judgment };

/** Keep the frozen report intact; only the known generated reference sections move to the appendix. */
export function splitDigestMarkdown(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const sections = normalized.split(/(?=^##\s+)/m);
  const body: string[] = [], references: string[] = [], themes: string[] = [];
  for (const section of sections) {
    if (/^##\s+(材料摘要|待摘要原文)\s*$/m.test(section.split('\n')[0])) references.push(section);
    else if (/^##\s+本期主题\s*$/.test(section.split('\n')[0])) themes.push(section);
    else body.push(section);
  }
  const clean = (value: string) => value
    .replace(/^# 财经日报\s*\n/, '')
    .replace(/^> \*\*[^\n]+冻结材料[^\n]*\n/, '')
    .replace(/(?:^|\n)---\s*(?=\n|$)/g, '\n').trim();
  return { body: clean(body.join('')), references: clean(references.join('')), themes: clean(themes.join('')) };
}

export function digestReport(digest: DigestRow) {
  const ids = [...new Set(parseArticleIds(digest.article_ids).filter(id => Number.isInteger(id) && id > 0))];
  const materials = ids.length ? db.prepare(
    "SELECT a.id,a.title,tr.title_zh,a.publisher,a.url,a.published_at,a.fetched_at,a.raw_text,s.summary,j.content judgment FROM articles a LEFT JOIN summaries s ON s.article_id=a.id LEFT JOIN article_translations tr ON tr.article_id=a.id LEFT JOIN article_judgments j ON j.article_id=a.id WHERE a.id IN(" +
    ids.map(() => '?').join(',') + ") ORDER BY CASE WHEN a.source_tier='official' THEN 0 ELSE 1 END,a.published_at DESC,a.id DESC"
  ).all(...ids) as DigestMaterial[] : [];
  const theses: DigestThesis[] = [];
  const seen = new Set<string>();
  for (const material of materials) {
    let parsed: unknown;
    try { parsed = JSON.parse(material.judgment || 'null'); } catch { continue; }
    const judgment = validateJudgment(parsed, material.raw_text || '');
    if (!judgment) continue;
    const key = judgment.thesis.replace(/\s/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    theses.push({ material, judgment });
    if (theses.length === 8) break;
  }
  return { materials, theses, ...splitDigestMarkdown(digest.full_content_md || '') };
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}

export default function DigestBody({ digest }: { digest: DigestRow }) {
  const report = digestReport(digest);
  return <div className="digest-report">
    <nav className="digest-toc" aria-label="本期阅读目录">
      {report.theses.length > 0 && <a href="#digest-theses">本期判断</a>}
      {report.body && <a href="#digest-synthesis">综合阅读</a>}
      <a href="#digest-references">原始依据</a>
    </nav>
    {report.theses.length > 0 ? <section id="digest-theses" className="digest-theses">
      <div className="section-heading"><h2>本期判断</h2><span className="quiet-copy">模型解读 · 条件成立时适用</span></div>
      <ol>{report.theses.map(({ material, judgment }, index) => <li key={material.id} className="digest-thesis">
        <div className="digest-thesis-heading"><span className="digest-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><p className="eyebrow">{judgment.horizon === 'long' ? '长期观察' : judgment.horizon === 'short' ? '短期观察' : '背景研究'}</p><h3>{judgment.thesis}</h3></div></div>
        <p className="digest-mechanism">{judgment.mechanism}</p>
        <dl className="digest-checks"><div><dt>反向检验</dt><dd>{judgment.counterpoint}</dd></div><div><dt>继续跟踪</dt><dd>{judgment.watch}</dd></div></dl>
        <details className="digest-evidence"><summary>核对依据 · {material.publisher || '原始材料'}</summary><blockquote>“{judgment.evidence}”</blockquote><p><a className="text-link" href={externalUrl(material.url)} target="_blank" rel="noreferrer">{material.title_zh || material.title} ↗</a><span className="quiet-copy"> · {material.published_at ? '发布 ' + formatDate(material.published_at) : '发布日期未标注'}</span></p><Link className="text-link" href={'/articles/' + material.id}>阅读材料与完整摘要 →</Link></details>
      </li>)}</ol>
    </section> : <p className="digest-availability">本期尚无具有完整原文依据的研究判断。{report.body ? '以下保留已生成的日报正文。' : '以下先呈现已保存的材料摘要，暂不推导市场方向。'}</p>}
    {report.body && <section id="digest-synthesis" className="digest-synthesis reader-content"><Markdown>{report.body}</Markdown></section>}
    {!report.theses.length && !report.body && report.references && <section className="digest-summary-fallback reader-content"><Markdown>{report.references}</Markdown></section>}
    <section id="digest-references" className="digest-references">
      <div className="section-heading"><h2>参考材料</h2><Link className="text-link" href={'/search?date=' + digest.date}>检索本期材料 →</Link></div>
      <p className="quiet-copy">按收录日期归档，原始发布日期见各条资料。</p>
      {report.materials.length > 0 && <ol className="digest-reference-list">{report.materials.map(material => <li key={material.id}><a href={externalUrl(material.url)} target="_blank" rel="noreferrer">{material.title_zh || material.title} ↗</a><p>{material.publisher || '来源未标注'} · {material.published_at ? '发布 ' + formatDate(material.published_at) : '发布日期未标注'}{material.summary?.trim() ? '' : ' · 摘要待补'}</p></li>)}</ol>}
      {report.references && (report.theses.length > 0 || report.body) && <details className="digest-source-summaries"><summary>展开本期全部材料摘要</summary><div className="reader-content"><Markdown>{report.references}</Markdown></div></details>}
      {report.themes && <details className="digest-source-summaries"><summary>查看本期主题索引</summary><div className="reader-content"><Markdown>{report.themes}</Markdown></div></details>}
      {!report.materials.length && !report.references && <p className="quiet-copy">本期暂无已保存的参考材料。</p>}
    </section>
  </div>;
}
