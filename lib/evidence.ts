/**
 * 证据等级计算：把「证据等级」与「模型解析置信度」分开。
 *  - confidence（summaries.confidence）= 模型解析置信度：模型是否确定自己理解了文章。
 *  - evidence_level（summaries.evidence_level）= 证据等级：内容是否经过官方材料或多个独立来源支持。
 *
 * 计算规则（对某期日报的文章集合）：
 *  - official：来源为官方一手（source_tier === 'official' 且 is_primary）
 *  - multi_source：同一主题（tags 有交集）有 ≥ 2 个不同来源（publisher/author 不同）同向
 *  - single_source：只有一个来源
 *  - unverified：无摘要或无法判断
 */
import type { ArticleRow, EvidenceLevel, SummaryRow } from './types';

function safeTags(s: string | null): string[] {
  if (!s) return [];
  try {
    const t = JSON.parse(s);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

export function computeEvidenceLevels(
  articles: ArticleRow[],
  summaries: SummaryRow[]
): void {
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const summaryByArticle = new Map(summaries.map((s) => [s.article_id, s]));

  // 预分组：按 tag 收集（同主题的文章 id 列表）
  const tagToArticles = new Map<string, number[]>();
  for (const s of summaries) {
    for (const tag of safeTags(s.tags)) {
      const list = tagToArticles.get(tag) || [];
      list.push(s.article_id);
      tagToArticles.set(tag, list);
    }
  }

  for (const s of summaries) {
    const a = articleById.get(s.article_id);
    if (!a) {
      s.evidence_level = 'unverified';
      continue;
    }

    // 官方一手来源 → official
    if (a.source_tier === 'official' && a.is_primary === 1) {
      s.evidence_level = 'official';
      continue;
    }

    // 多来源：同一主题下 ≥2 个不同来源
    const tags = safeTags(s.tags);
    const sources = new Set<string>();
    for (const tag of tags) {
      const related = tagToArticles.get(tag) || [];
      for (const id of related) {
        const rel = articleById.get(id);
        const key = rel?.canonical_url || rel?.url || rel?.publisher || rel?.author || String(id);
        sources.add(key);
      }
    }
    s.evidence_level = sources.size >= 2 ? 'multi_source' : 'single_source';
  }
}

export const evidenceLabel: Record<EvidenceLevel, string> = {
  official: '官方',
  multi_source: '多源',
  single_source: '单一来源',
  unverified: '待核验',
};
