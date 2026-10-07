export function deliveryState(date: string | null, total: number, summaries: number, items: number, today: string) {
  return {
    stale: Boolean(date && date < today),
    pendingSummaryCount: Math.max(0, total - summaries),
    contentState: (!total ? 'empty' : summaries === 0 ? 'pending' : summaries < total || items === 0 ? 'partial' : 'ready') as 'empty' | 'pending' | 'partial' | 'ready',
  };
}
export const contentLabels = { empty: '暂无材料', pending: '待生成摘要', partial: '部分就绪', ready: '简报已就绪' };
