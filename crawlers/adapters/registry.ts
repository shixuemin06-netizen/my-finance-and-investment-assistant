/** Source adapter registry plus durable source-health registry. */
import fs from 'fs';
import db from '../../lib/db';
import { crawlRssSource } from '../rss';
import { crawlWebsiteSource } from '../website';
import { csrcAdapter } from './csrc';
import { pbocAdapter } from './pboc';
import { nbsAdapter } from './nbs';
import type { Adapter, RssSourceConfig, WebsiteSourceConfig } from './types';
import type { NormalizedArticle, SourceTier } from '../../lib/types';

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
  nbs: nbsAdapter,
};

export function buildAdapters(): Adapter[] {
  const sources: SourcesFile = JSON.parse(fs.readFileSync('sources.json', 'utf-8'));
  const adapters: Adapter[] = [];

  for (const official of sources.official ?? []) {
    if (!official.enabled) continue;
    const adapter = OFFICIAL_ADAPTERS[official.id];
    if (adapter) adapters.push(adapter);
  }
  for (const rss of sources.rss ?? []) {
    if (!rss.enabled) continue;
    adapters.push({
      id: `rss:${rss.name}`,
      name: rss.name,
      tier: rss.tier ?? 'community',
      isPrimary: rss.isPrimary ?? false,
      crawl: () => crawlRssSource(rss),
    });
  }
  for (const website of sources.websites ?? []) {
    if (!website.enabled) continue;
    adapters.push({
      id: `web:${website.name}`,
      name: website.name,
      tier: website.tier ?? 'media',
      isPrimary: website.isPrimary ?? false,
      crawl: () => crawlWebsiteSource(website),
    });
  }
  return adapters;
}

function authorityLevel(tier: SourceTier, isPrimary: boolean): number {
  if (tier === 'official' && isPrimary) return 1;
  if (tier === 'media') return 2;
  return 3;
}

/** Persist currently enabled adapter metadata without treating a configured source as healthy. */
export function syncSourceRegistry(): void {
  db.transaction(() => {
    for (const adapter of buildAdapters()) {
      db.upsert('sources', {
        source_key: adapter.id,
        name: adapter.name,
        platform: adapter.id.split(':')[0] || 'website',
        config_json: null,
        priority: authorityLevel(adapter.tier, adapter.isPrimary),
        enabled: 1,
        source_tier: adapter.tier,
        is_primary: adapter.isPrimary ? 1 : 0,
        authority_level: authorityLevel(adapter.tier, adapter.isPrimary),
        topic_scope: null,
      }, ['source_key'], [
        'name', 'platform', 'priority', 'enabled', 'source_tier', 'is_primary',
        'authority_level',
      ]);
    }
  });
}

export function recordSourceResults(
  results: Array<{ id: string; ok: boolean; count: number; error?: string }>,
  at = new Date().toISOString(),
): void {
  const now = at;
  db.transaction(() => {
    const update = db.prepare(`
      UPDATE sources
      SET last_run_at = ?, last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
          last_status = ?, last_error = ?, last_count = ?
      WHERE source_key = ?
    `);
    for (const result of results) {
      update.run(now, result.ok ? 1 : 0, now, result.ok ? 'success' : 'failed', result.error || null, result.count, result.id);
    }
  });
}

export async function crawlAllAdapters(adapters: Adapter[] = buildAdapters()): Promise<{
  articles: NormalizedArticle[];
  sourceResults: Array<{ id: string; ok: boolean; count: number; error?: string }>;
}> {

  const articles: NormalizedArticle[] = [];
  const sourceResults: Array<{ id: string; ok: boolean; count: number; error?: string }> = [];

  for (const adapter of adapters) {
    try {
      const items = await adapter.crawl();
      articles.push(...items);
      sourceResults.push({ id: adapter.id, ok: true, count: items.length });
      console.log(`[采集] ${adapter.name}: ${items.length} 篇`);
    } catch (error: any) {
      sourceResults.push({ id: adapter.id, ok: false, count: 0, error: error.message });
      console.error(`[采集] ${adapter.name} 失败: ${error.message}`);
    }
  }
  return { articles, sourceResults };
}