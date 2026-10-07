import {getStory,getStoryReports} from '@/lib/stories';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const story=getStory(id);return story?Response.json({story,reports:getStoryReports(id)}):Response.json({error:'事件不存在'},{status:404});}
