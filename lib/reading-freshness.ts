/** Self-contained so the public reader can use the same rule without server dependencies. */
export function readingFreshness(updatedAt: string | null, now = Date.now()) {
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return { state: 'unknown', label: '收录时间未标注', ageHours: null };
  if (timestamp > now + 5 * 60_000) return { state: 'unknown', label: '收录时间待核对', ageHours: null };
  const ageHours = Math.max(0, Math.floor((now - timestamp) / 3_600_000));
  if (ageHours >= 36) return { state: 'stale', label: ageHours >= 48 ? Math.floor(ageHours / 24) + ' 天未收录新材料' : ageHours + ' 小时未收录新材料', ageHours };
  return { state: 'recent', label: '已保存的资料快照', ageHours };
}
