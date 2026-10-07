import db from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(){
 const rows=db.prepare("SELECT st.title,a.url,u.note,u.updated_at FROM story_state u JOIN stories st ON st.id=u.story_id JOIN articles a ON a.id=st.representative_article_id WHERE u.profile_id='local' AND length(trim(u.note))>0 ORDER BY u.updated_at DESC").all();
 const legacy=db.prepare("SELECT a.title,a.url,n.note,n.updated_at FROM research_notes n JOIN articles a ON a.id=n.article_id WHERE length(trim(n.note))>0 ORDER BY n.updated_at DESC").all();
 const md='# 我的财经研究笔记\n\n导出时间：'+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'\n\n'+[...rows,...legacy].map(r=>'## '+r.title+'\n\n'+r.note+'\n\n原始材料：'+r.url+'\n\n记录时间：'+r.updated_at+'\n').join('\n---\n\n');
 return new Response(md,{headers:{'content-type':'text/markdown; charset=utf-8','content-disposition':'attachment; filename="research-notes.md"','cache-control':'no-store'}});
}
