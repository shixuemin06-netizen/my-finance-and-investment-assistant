import Link from 'next/link';
import JudgmentView from './JudgmentView';
import ResearchNote from './ResearchNote';
import { getLibrary, type LibraryQuery } from '@/lib/library';

export default function ArticleLibrary({ query, savedOnly = false }: { query: LibraryQuery; savedOnly?: boolean }) {
  const { items, total, page, pages, topics } = getLibrary(query, savedOnly);
  const route = savedOnly ? '/notebook' : '/matrix';
  const pageUrl = (number: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set('page', String(number)); return route + '?' + params;
  };
  return <>
    <form className="library-filters" action={route}>
      <label className="search-field"><span className="sr-only">搜索材料与笔记</span><input name="q" type="search" defaultValue={query.q} placeholder="搜索事件、公司、来源或笔记…" maxLength={120} /></label>
      <label><span className="sr-only">主题</span><select name="topic" defaultValue={query.topic || ''}><option value="">全部主题</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select></label>
      <label><span className="sr-only">{savedOnly ? '研究用途' : '文章倾向'}</span>{savedOnly
        ? <select name="period" defaultValue={query.period || ''}><option value="">全部用途</option><option value="long">长期价值</option><option value="short">短期观察</option><option value="knowledge">知识积累</option></select>
        : <select name="stance" defaultValue={query.stance || ''}><option value="">全部倾向</option><option value="bullish">文章偏多</option><option value="bearish">文章偏空</option><option value="neutral">中性</option></select>}</label>
      <button className="primary-button" type="submit">筛选</button>
      {(query.q || query.topic || query.stance || query.period) && <Link className="text-link" href={route}>清除筛选</Link>}
    </form>
    <div className="library-meta"><span>{total} 条{savedOnly ? '收藏' : '材料'}</span><span>按入库顺序 · 每页 15 条</span></div>
    <section className="library-list" aria-label="材料列表">
      {items.map(item => <article className="library-item" key={item.id} id={'article-' + item.id}>
        <div className="library-byline"><span>{item.publisher || item.author || '来源待补'}</span><span>{item.published_at?.slice(0, 10) || '收录于 ' + item.fetched_at.slice(0, 10)}</span><span className={'evidence-chip ' + (item.source_tier === 'official' && item.is_primary ? 'official' : 'single_source')}>{item.source_tier === 'official' && item.is_primary ? '官方原文' : '来源报道'}</span></div>
        <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<span aria-hidden="true"> ↗</span></a></h2>
        <p className="article-preview">{item.summary || (item.excerpt ? '原文节选 · ' + item.excerpt.slice(0,180) + '…' : '仅保存了原文链接，打开来源阅读全文。')}</p>
        <details className="article-details"><summary>展开{item.summary ? '完整摘要与主题' : '原文片段'}</summary>
          <p>{item.summary || item.excerpt || '当前没有可用正文，请打开原文。'}</p>
          {!item.summary && <small>以上为已保存的原文片段，未经模型总结。</small>}
          <p className="article-caveat">{item.summary ? '模型摘要，未人工核验。文章的多空倾向不代表具体资产或期限的投资结论。' : '当前展示原文节选。可在运行与待办中生成摘要与研究判断。'}</p>
          <div className="tag-row">{parseTags(item.tags).map(tag => <Link className="soft-tag" href={'/matrix?topic=' + encodeURIComponent(tag)} key={tag}>{tag}</Link>)}</div>
          <a href={item.url} target="_blank" rel="noreferrer" className="text-link">核对原始来源 ↗</a>
        </details>
        {item.judgment && <JudgmentView value={JSON.parse(item.judgment)} />}
        {savedOnly && item.note && <blockquote className="saved-note"><b>我的笔记</b>{item.note}</blockquote>}
        <ResearchNote articleId={item.id} initialSaved={Boolean(item.saved)} initialNote={item.note || ''} initialHorizon={item.horizon || 'long'} />
      </article>)}
      {!items.length && <div className="empty-card"><span>＋</span><h3>{savedOnly ? '把值得反复思考的材料留在这里' : '没有找到匹配的材料'}</h3><p>{savedOnly ? '在材料库中加入研究夹，记录判断依据、反证和待验证问题。' : '试试更短的关键词，或清除主题与倾向筛选。'}</p><Link className="secondary-button" href="/matrix">{savedOnly ? '去材料库挑选 →' : '查看全部材料 →'}</Link></div>}
    </section>
    {pages > 1 && <nav className="library-pager" aria-label="材料分页">{page > 1 ? <Link href={pageUrl(page - 1)}>← 上一页</Link> : <span>← 上一页</span>}<span>{page} / {pages}</span>{page < pages ? <Link href={pageUrl(page + 1)}>下一页 →</Link> : <span>下一页 →</span>}</nav>}
  </>;
}
function parseTags(value: string | null): string[] { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? [...new Set(parsed.map(String))] : []; } catch { return []; } }
