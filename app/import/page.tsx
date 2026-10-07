import Inbox from '@/components/Inbox';
import db from '@/lib/db';
export const dynamic = 'force-dynamic';
export default function ImportPage() {
 const items = db.prepare('SELECT id,title,url,source_note,status,staged_at FROM staged_articles ORDER BY id DESC LIMIT 40').all() as Array<{id:number;title:string|null;url:string;source_note:string|null;status:string;staged_at:string}>;
 return <Inbox items={items} />;
}
