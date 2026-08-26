/**
 * 信源适配器注册表：读 sources.json，构造启用源的适配器实例，供 pipeline 统一调用。
 *
 * 结构：
 *   - 官方适配器（official）：csrc / pboc（硬编码，读 sources.json 的 enabled 开关）
 *   - RSS 源：每个 rss 条目一个 crawlRssSource
 *   - 网站源：每个 website 条目一个 crawlWebsiteSource
 *   - 微信源：本轮 enabled=false，不接入（搜狗反爬，留待后续）
 */
import fs from 'fs';
import { crawlRssSource } from '../rss';
import { crawlWebsiteSource } from '../website';
import { csrcAdapter } from './csrc';
import { pbocAdapter } from './pboc';
import type { Adapter, RssSourceConfig, WebsiteSourceConfig } from './types';
import type { NormalizedArticle } from '../../lib/types';

interface SourcesFile {
  rss?: RssSourceConfig[];
  websites?: WebsiteSourceConfig[];
  official?: Array<{ id: string; name: string; enabled: boolean }>;
  wechat?: any[];
  x_accounts?: string[];
}

const OFFICIAL_ADAPTERS: Record<string, Adapter> = {
  csrc: csrcAdapter,
  pboc: pbocAdapter,
};

/** 构建启用的适配器列表 */
export function buildAdapters(): Adapter[] {
  const sources: SourcesFile = JSON.parse(
    fs.readFileSync('sources.json', 'utf-8')
  );
  const adapters: Adapter[] = [];

  // 官方源
  for (const o of sources.official ?? []) {
    if (!o.enabled) continue;
    const adapter = OFFICIAL_ADAPTERS[o.id];
    if (adapter) adapters.push(adapter);
  }

  // RSS 源
  for (const r of sources.rss ?? []) {
    if (!r.enabled) continue;
    const rssConfig = r;
    adapters.push({
      id: `rss:${rssConfig.name}`,
      name: rssConfig.name,
      tier: rssConfig.tier ?? 'community',
      isPrimary: rssConfig.isPrimary ?? false,
      crawl: () => crawlRssSource(rssConfig),
    });
  }

  // 网站源
  for (const w of sources.websites ?? []) {
    if (!w.enabled) continue;
    const webConfig = w;
    adapters.push({
      id: `web:${webConfig.name}`,
      name: webConfig.name,
      tier: webConfig.tier ?? 'media',
      isPrimary: webConfig.isPrimary ?? false,
      crawl: () => crawlWebsiteSource(webConfig),
    });
  }

  return adapters;
}

/**
 * 抓取所有启用适配器，返回 { articles, sourceResults }。
 * sourceResults 用于写 job_runs（每个信源是否成功、篇数、失败原因）。
 */
export async function crawlAllAdapters(): Promise<{
  articles: NormalizedArticle[];
  sourceResults: Array<{ id: string; ok: boolean; count: number; error?: string }>;
}> {
  const adapters = buildAdapters();
  const articles: NormalizedArticle[] = [];
  const sourceResults: Array<{ id: string; ok: boolean; count: number; error?: string }> = [];

  for (const adapter of adapters) {
    try {
      const items = await adapter.crawl();
      articles.push(...items);
      sourceResults.push({ id: adapter.id, ok: true, count: items.length });
      console.log(`[采集] ${adapter.name}: ${items.length} 篇`);
    } catch (e: any) {
      sourceResults.push({ id: adapter.id, ok: false, count: 0, error: e.message });
      console.error(`[采集] ${adapter.name} 失败: ${e.message}`);
    }
  }

  return { articles, sourceResults };
}
