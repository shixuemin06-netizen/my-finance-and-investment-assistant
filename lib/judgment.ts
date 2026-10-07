export type Judgment = { thesis:string; mechanism:string; evidence:string; counterpoint:string; watch:string; horizon:'long'|'short'|'knowledge';direction?:'bullish'|'bearish'|'neutral';asset?:string;conditions?:string };
export function validateJudgment(raw: unknown, source: string): Judgment | undefined {
  if (!raw || typeof raw !== 'object') return;
  const value=raw as Record<string,unknown>;
  if (!['thesis','mechanism','evidence','counterpoint','watch'].every(k=>typeof value[k]==='string' && (value[k] as string).trim().length>0 && (value[k] as string).length<=600)) return;
  const quote=(value.evidence as string).trim();
  if (quote.length<8 || !source.replace(/\s/g,'').includes(quote.replace(/\s/g,''))) return;
  if (!['long','short','knowledge'].includes(String(value.horizon))) return;
  const clean={thesis:value.thesis,mechanism:value.mechanism,evidence:value.evidence,counterpoint:value.counterpoint,watch:value.watch,horizon:value.horizon} as Judgment;
  if(['bullish','bearish','neutral'].includes(String(value.direction))&&typeof value.asset==='string'&&value.asset.trim()&&value.asset.length<=100&&typeof value.conditions==='string'&&value.conditions.trim()&&value.conditions.length<=600){clean.direction=value.direction as Judgment['direction'];clean.asset=value.asset.trim();clean.conditions=value.conditions.trim();}
  return clean;
}
