/**
 * 「今天值得关注的三件事」选择器。
 *
 * 替代旧版 summaries.slice(0,3) 的任意取法，用明确规则评分：
 *   score = 政策影响范围(0-3) + 一手来源等级(0-3) + 独立信源数(0-3) + 时效(0-1) + 与昨日差异(0-2)
 *
 * 输入：本期文章 + 摘要 + 昨日日报的文章集合（用于「与昨日差异」）。
 */
import type { ArticleRow, SummaryRow } from './types';

export interface ScoredInsight {
  articleId: number;
  score: number;
}

export function selectTopInsights(
  articles: ArticleRow[],
  summaries: SummaryRow[],
  previousArticleIds?: number[],
  topN = 3
): number[] {
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const prevSet = new Set(previousArticleIds || []);

  const scored: ScoredInsight[] = summaries.map((s) => {
    const a = articleById.get(s.article_id);
    if (!a) return { articleId: s.article_id, score: 0 };

    let score = 0;

    // 1. 一手来源等级：官方一手 3 分，媒体 2 分，社区 1 分
    if (a.source_tier === 'official' && a.is_primary === 1) score += 3;
    else if (a.source_tier === 'media') score += 2;
    else score += 1;

    // 2. 政策影响范围：标题/摘要命中宏观关键词 +3
    const text = `${a.title} ${s.summary}`;
    const macroHits = [
      '降息', '降准', '利率', '货币政策', '财政', '监管', '证监会', '人民银行', '央行',
      '汇率', '房地产', '关税', '国债', 'IPO', '退市', '数据发布', '通胀', '就业',
    ].filter((k) => text.includes(k)).length;
    score += Math.min(macroHits, 3);

    // 3. 独立信源数：同主题（tags 交集）不同来源计数（此处用 tags 数做近似代理）
    const tags = safeTags(s.tags);
    score += Math.min(tags.length, 3);

    // 4. 时效：有发布日期 +1
    if (a.published_at) score += 1;

    // 5. 与昨日差异：不在昨日集合 +2（新变化）
    if (!prevSet.has(a.id)) score += 2;

    return { articleId: s.article_id, score };
  });

  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, topN).map((s) => s.articleId);
}

function safeTags(s: string | null): string[] {
  if (!s) return [];
  try {
    const t = JSON.parse(s);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}
