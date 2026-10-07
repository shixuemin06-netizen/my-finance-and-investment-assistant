/** Stable source identity without database, filesystem, or private-state imports. */
import { createHash } from 'node:crypto';
export type GenerationSource = { id?: number; title: string; raw_text?: string | null; url: string; published_at?: string | null };
export function contentFingerprint(source: GenerationSource): string {
  const clean = (value: string | null | undefined) => String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(JSON.stringify({
    title: clean(source.title), url: clean(source.url), published_at: clean(source.published_at), body: clean(source.raw_text),
  })).digest('hex');
}
