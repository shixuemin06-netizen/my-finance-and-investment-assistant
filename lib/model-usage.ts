import db from './db';
import { modelConfig } from './model-config';
import { beijingToday } from './time';
export function usageToday() {
  const c = modelConfig();
  const row = db.prepare('SELECT count(*) requests, COALESCE(sum(estimated_cny),0) cost, COALESCE(sum(input_tokens+output_tokens),0) tokens FROM model_usage WHERE day=?').get(beijingToday())!;
  const last = db.prepare('SELECT returned_model,status FROM model_usage WHERE provider=? AND model=? ORDER BY id DESC LIMIT 1').get(c.provider,c.model);
  return { model:c.model, provider:c.provider, budget:c.budget, limit:c.requestLimit, requests:Number(row.requests), cost:Number(row.cost), tokens:Number(row.tokens), lastModel:last?.returned_model || null, lastStatus:last?.status || null };
}
export function reserveUsage(input: string, maxOutput: number) {
  const c=modelConfig();
  // UTF-8 bytes upper-bound text tokens, plus a generous envelope for message framing.
  const reserve=((Buffer.byteLength(input,'utf8')+4096)*c.inputRate+maxOutput*c.outputRate)/1e6;
  return db.transaction(() => {
    const u=usageToday();
    if(u.requests >= c.requestLimit || u.cost+reserve > c.budget) throw Object.assign(new Error('已达到今日模型预算或请求上限'),{status:429});
    return Number(db.prepare('INSERT INTO model_usage(day,provider,model,estimated_cny,status,created_at) VALUES(?,?,?,?,?,?)').run(beijingToday(),c.provider,c.model,reserve,'reserved',new Date().toISOString()).lastInsertRowid);
  });
}
export function finishUsage(id:number, input:number, output:number, returnedModel:string) {
  const c=modelConfig();
  db.prepare("UPDATE model_usage SET input_tokens=?,output_tokens=?,estimated_cny=?,returned_model=?,status='success' WHERE id=?").run(input,output,(input*c.inputRate+output*c.outputRate)/1e6,returnedModel,id);
}
export function failUsage(id:number, status='failed_or_unknown') { db.prepare('UPDATE model_usage SET status=? WHERE id=?').run(status,id); }
