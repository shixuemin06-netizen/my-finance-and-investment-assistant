import db from '@/lib/db';
import {isLocalMutation} from '@/lib/local-request';
export async function POST(req:Request){
 if(!isLocalMutation(req))return Response.json({error:'请从本地页面操作'},{status:403});
 let body;try{body=await req.json();}catch{return Response.json({error:'请求无效'},{status:400});}
 if(body.action!=='visit')return Response.json({error:'请求无效'},{status:400});
 const day=new Date().toISOString().slice(0,10);
 if(!db.prepare("SELECT id FROM product_activity WHERE action='visit' AND target_id=?").get(day))
 db.prepare("INSERT INTO product_activity(action,target_id,created_at) VALUES('visit',?,?)").run(day,new Date().toISOString());
 return Response.json({ok:true});
}