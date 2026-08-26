/**
 * 日报生成：读 summaries + divergence → 拼 Markdown → 写 digests + keywords_trend。
 *
 * 正确性要点（相对旧版）：
 *  - 严格按文章归桶字段（fetched_at / published_at）筛选，不再把「当天生成摘要的旧文章」算入今日；
 *  - 生成时把包含文章的 id 冻结写入 digests.article_ids，并回写文章 digest_date，
 *    日报页/归档读冻结集合，不再运行时重推导。
 */
import db, { readTable, writeTable } from '../lib/db';
import type { ArticleRow, SummaryRow, DivergenceRow, DigestRow, KeywordTrendRow } from '../lib/types';

export function generateDigest(
  date?: string,
  bucketField: 'fetched_at' | 'published_at' = 'fetched_at'
): void {
  const today = date || new Date().toISOString().slice(0, 10);
  const dateDisplay = formatDateDisplay(today);

  // JS 侧 JOIN：articles + summaries
  const articles = readTable('articles') as ArticleRow[];
  const summaries = readTable('summaries') as SummaryRow[];

  // 严格按归桶字段筛选「本期」文章
  const recentArticles = articles.filter((a) => {
    const d = (a[bucketField] || '').slice(0, 10);
    return d === today;
  });
  const recentIds = new Set(recentArticles.map((a) => a.id));

  const joined = summaries
    .filter((s) => recentIds.has(s.article_id))
    .map((s) => {
      const a = articles.find((a) => a.id === s.article_id);
      return {
        id: s.article_id,
        author: a?.author || null,
        publisher: a?.publisher || null,
        title: a?.title || '',
        url: a?.url || '',
        published_at: a?.published_at || null,
        summary: s.summary,
        tags: s.tags,
        stance: s.stance,
        confidence: s.confidence,
      };
    });

  // 2. 读分歧
  const divergences = (readTable('divergence') as DivergenceRow[]).filter(
    (d) => d.digest_date === today
  );

  // 3. 统计关键词
  const keywordCount: Record<string, number> = {};
  for (const a of joined) {
    const tags: string[] = a.tags ? safeJsonParse(a.tags) : [];
    for (const t of tags) {
      keywordCount[t] = (keywordCount[t] || 0) + 1;
    }
  }

  // 写入 keywords_trend
  const trends = readTable('keywords_trend') as KeywordTrendRow[];
  for (const [kw, cnt] of Object.entries(keywordCount)) {
    const existing = trends.find((t) => t.keyword === kw && t.date === today);
    if (existing) {
      existing.count = cnt;
    } else {
      trends.push({ id: trends.length + 1, keyword: kw, date: today, count: cnt });
    }
  }
  writeTable('keywords_trend', trends);

  // 4. 拼 Markdown
  let md = `# 📋 财经日报\n`;
  md += `> **${dateDisplay}**  |  共 ${joined.length} 篇文章\n\n`;

  // 4a. 分歧板块
  if (divergences.length > 0) {
    md += `---\n## 🔴 今日共识与分歧\n\n`;
    for (const d of divergences) {
      md += d.summary_md || '';
      md += '\n\n';
    }
  }

  // 4b. 关键词热度
  if (Object.keys(keywordCount).length > 0) {
    md += `---\n## 📊 关键词热度\n\n`;
    const sorted = Object.entries(keywordCount).sort((a, b) => b[1] - a[1]);
    for (const [kw, cnt] of sorted) {
      const bar = '█'.repeat(Math.min(cnt, 10));
      md += `- **${kw}** ${bar} (${cnt}次)\n`;
    }
    md += '\n';
  }

  // 4c. 文章摘要
  md += `---\n## 📖 今日文章摘要\n\n`;

  const stanced = {
    bearish: joined.filter((a) => a.stance === 'bearish'),
    bullish: joined.filter((a) => a.stance === 'bullish'),
    neutral: joined.filter((a) => a.stance === 'neutral' || !a.stance),
  };

  for (const [stance, list] of Object.entries(stanced)) {
    if (list.length === 0) continue;
    const emoji = { bearish: '🔴', bullish: '🟢', neutral: '⚪' }[stance] || '⚪';

    for (const a of list) {
      md += `### ${emoji} ${a.title}\n`;
      md += `**${a.publisher || a.author || '未知'}** · ${a.published_at || ''}  \n`;
      md += `> ${a.summary}\n\n`;
      const tags: string[] = a.tags ? safeJsonParse(a.tags) : [];
      if (tags.length > 0) {
        md += `🏷️ ${tags.map((t) => `\`${t}\``).join(' ')}  \n`;
      }
      md += `📎 [原文](${a.url})\n\n`;
    }
  }

  // 5. 一句话总结
  const bullishCount = stanced.bullish.length;
  const bearishCount = stanced.bearish.length;
  const oneLiner =
    joined.length === 0
      ? '今日无更新。'
      : bullishCount > bearishCount
        ? `今日偏多情绪占优，${bullishCount}篇看多 vs ${bearishCount}篇看空。`
        : bearishCount > bullishCount
          ? `今日偏空情绪占优，${bearishCount}篇看空 vs ${bullishCount}篇看多。`
          : `今日多空均衡。`;

  // 6. 冻结本期文章集合 + 写 digests
  const articleIds = JSON.stringify(joined.map((a) => a.id));

  const digests = readTable('digests') as DigestRow[];
  const existing = digests.find((d) => d.date === today);
  if (existing) {
    existing.title = `${dateDisplay} 财经日报`;
    existing.one_liner = oneLiner;
    existing.full_content_md = md;
    existing.article_count = joined.length;
    existing.article_ids = articleIds;
    existing.generated_at = new Date().toISOString();
  } else {
    digests.push({
      id: digests.length + 1,
      date: today,
      title: `${dateDisplay} 财经日报`,
      one_liner: oneLiner,
      full_content_md: md,
      article_count: joined.length,
      article_ids: articleIds,
      generated_at: new Date().toISOString(),
    });
  }
  writeTable('digests', digests);

  // 7. 回写文章 digest_date（标记进入哪期日报）
  let touched = false;
  const updatedArticles = articles.map((a) => {
    if (recentIds.has(a.id) && a.digest_date !== today) {
      a.digest_date = today;
      touched = true;
    }
    return a;
  });
  if (touched) writeTable('articles', updatedArticles);

  console.log(`[日报] ✅ 已生成 ${dateDisplay} 日报（${joined.length} 篇）`);
}

/** 把 YYYY-MM-DD 转成「2026年8月14日星期六」这样的中文日期（用上海时区正午避免跨日偏移） */
function formatDateDisplay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  });
}

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return []; }
}
