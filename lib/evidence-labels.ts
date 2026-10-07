import type { EvidenceLevel } from './types';

/** Browser-safe copy only; evidence calculation stays server-side. */
export const evidenceLabel: Record<EvidenceLevel, string> = {
  official: '官方一手',
  multi_source: '同主题报道（待核）',
  single_source: '单一机构',
  unverified: '待核验',
};