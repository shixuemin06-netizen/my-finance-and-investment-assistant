/**
 * Deterministic editorial selector for the daily three. It ranks a frozen set,
 * uses topic coverage only for editorial ordering (not evidence), and returns the
 * reason that is stored in digest_items.
 */
import type { ArticleRow, SummaryRow } from './types';
import { safeTags } from './evidence';

export interface ScoredInsight {
  articleId: number;
  score: number;
  reasons: string[];
}

function sourceIdentity(article: ArticleRow): string | null {
  const value = article.publisher || article.author;
  return value ? value.trim().toLocaleLowerCase('zh-CN') : null;
}

function groupKey(tag: string, stance: SummaryRow['stance']): string {
  return `${tag.trim().toLocaleLowerCase('zh-CN')}::${stance || 'neutral'}`;
}

function sourceGroups(articles: ArticleRow[], summaries: SummaryRow[]): Map<string, Set<string>> {
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const groups = new Map<string, Set<string>>();
  for (const summary of summaries) {
    const article = articleById.get(summary.article_id);
    const source = article ? sourceIdentity(article) : null;
    if (!source) continue;
    for (const tag of safeTags(summary.tags)) {
      const key = groupKey(tag, summary.stance);
      const values = groups.get(key) || new Set<string>();
      values.add(source);
      groups.set(key, values);
    }
  }
  return groups;
}

export function scoreInsights(
  articles: ArticleRow[],
  summaries: SummaryRow[],
  previousArticleIds?: number[],
): ScoredInsight[] {
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const previous = new Set(previousArticleIds || []);
  const groups = sourceGroups(articles, summaries);

  const scored = summaries.map((summary) => {
    const article = articleById.get(summary.article_id);
    if (!article) return { articleId: summary.article_id, score: 0, reasons: ['缺少原始材料'] };

    let score = 0;
    const reasons: string[] = [];
    if (article.source_tier === 'official' && article.is_primary === 1) {
      score += 3;
      reasons.push('官方一手材料');
    } else if (article.source_tier === 'media') {
      score += 2;
      reasons.push('专业媒体材料');
    } else {
      score += 1;
      reasons.push('社区/线索材料');
    }

    const text = `${article.title} ${summary.summary}`;
    const macroHits = [
      '降息', '降准', '利率', '货币政策', '财政', '监管', '证监会', '人民银行', '央行',
      '汇率', '房地产', '关税', '国债', 'IPO', '退市', '数据发布', '通胀', '就业',
    ].filter((keyword) => text.includes(keyword)).length;
    if (macroHits) {
      score += Math.min(macroHits, 3);
      reasons.push('关联宏观或监管议题');
    }

    const tags = safeTags(summary.tags);
    const independentSources = Math.max(
      0,
      ...tags.map((tag) => groups.get(groupKey(tag, summary.stance))?.size || 0),
    );
    if (independentSources >= 2) {
      score += Math.min(independentSources - 1, 3);
      reasons.push(`${independentSources} 家机构涉及同一主题`);
    }

    if (article.published_at) {
      score += 1;
      reasons.push('带有发布时间');
    }
    if (!previous.has(article.id)) {
      score += 2;
      reasons.push('相对上一期新增');
    }

    return { articleId: article.id, score, reasons };
  });

  return scored.sort((left, right) => right.score - left.score || right.articleId - left.articleId);
}

export function selectionReasonFor(articleId: number, scored: ScoredInsight[]): string {
  const item = scored.find((candidate) => candidate.articleId === articleId);
  return item?.reasons.slice(0, 3).join(' · ') || '按本期材料的权威度、关联度与时效排序';
}

export function selectTopInsights(
  articles: ArticleRow[],
  summaries: SummaryRow[],
  previousArticleIds?: number[],
  topN = 3,
): number[] {
  return scoreInsights(articles, summaries, previousArticleIds)
    .slice(0, topN)
    .map((item) => item.articleId);
}