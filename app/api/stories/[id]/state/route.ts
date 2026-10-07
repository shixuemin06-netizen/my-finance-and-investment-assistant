import {isLocalMutation} from '@/lib/local-request';
import {updateStoryState} from '@/lib/stories';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isLocalMutation(request))return Response.json({error:'请从本地网页操作。'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'请求格式有误'},{status:400});}
 const {action,value}=body||{};
 const valid=(['follow','save'].includes(action)&&typeof value==='boolean')||(action==='note'&&typeof value==='string'&&value.length<=4000)||(action==='read'&&Number.isSafeInteger(value)&&value>=0);
 if(!valid)return Response.json({error:'内容无效，笔记最多 4000 字。'},{status:400});
 const {id}=await params;return updateStoryState(id,action,value)?Response.json({ok:true}):Response.json({error:'事件不存在'},{status:404});
}
