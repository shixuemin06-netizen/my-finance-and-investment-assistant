import type { Judgment } from '@/lib/judgment';
export default function JudgmentView({value}:{value:Judgment}) {
  return <section className="judgment-view" aria-label="研究判断"><p className="section-label">研究判断 · 模型推论 · {value.horizon==='long'?'长期价值':value.horizon==='short'?'短期观察':'知识积累'}</p>{value.direction&&<p className={'direction '+value.direction}>{value.direction==='bullish'?'条件偏多':value.direction==='bearish'?'条件偏空':'中性观察'} · {value.asset}</p>}<h3>{value.thesis}</h3>{value.conditions&&<p>适用条件：{value.conditions}</p>}<p>{value.mechanism}</p><blockquote><b>原文依据</b>「{value.evidence}」</blockquote><dl><div><dt>反向检验</dt><dd>{value.counterpoint}</dd></div><div><dt>继续跟踪</dt><dd>{value.watch}</dd></div></dl></section>;
}
