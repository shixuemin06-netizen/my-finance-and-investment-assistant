export function modelConfig() {
  const provider = process.env.LLM_PROVIDER || 'deepseek';
  if (!['deepseek', 'zhipu'].includes(provider)) throw new Error('未知模型服务商');
  const model = process.env.LLM_MODEL || (provider === 'zhipu' ? 'glm-4.7-flash' : 'deepseek-flash');
  // Conservative local budget estimates in CNY per million tokens; provider bill is authoritative.
  const prices: Record<string, [number, number]> = { 'deepseek-flash': [2, 8], 'glm-4.7-flash': [0, 0], 'glm-4.7': [4, 16], 'glm-5.3': [12, 40], 'glm-5.3-flash': [2, 6] };
  if (!(model in prices) || (provider === 'zhipu') !== model.startsWith('glm-')) throw new Error('模型未通过成本白名单，请先核对官方价格');
  const finite = (s: string | undefined, fallback: number, max: number) => { const n = Number(s ?? fallback); return Number.isFinite(n) && n >= 0 ? Math.min(n,max) : fallback; };
  return { provider, model, key: (provider === 'zhipu' ? process.env.ZHIPU_API_KEY : process.env.DEEPSEEK_API_KEY)?.trim(),
    baseURL: provider === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4' : 'https://api.deepseek.com',
    inputRate: prices[model][0], outputRate: prices[model][1],
    budget: finite(process.env.LLM_DAILY_BUDGET_CNY, 1, 10),
    requestLimit: Math.floor(finite(process.env.LLM_DAILY_REQUEST_LIMIT, 200, 500)) };
}
export function modelConfigured() { try { return Boolean(modelConfig().key); } catch { return false; } }
export function realContentEnabled() { return process.env.LLM_REAL_CONTENT_ENABLED === '1'; }
