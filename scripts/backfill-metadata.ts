import db from '../lib/db';
import axios from 'axios';
import { extractPublishedDate } from '../crawlers/metadata';
const rows=db.prepare("SELECT id,url FROM articles WHERE published_at IS NULL AND url LIKE 'https://www.stcn.com/%' ORDER BY id DESC LIMIT 40").all();
let updated=0;
for(const row of rows){
try {const {data:html}=await axios.get(row.url,{timeout:8000});const date=extractPublishedDate(html);
if(date){db.prepare('UPDATE articles SET published_at=? WHERE id=? AND published_at IS NULL').run(date,row.id);updated++;}
}catch{}
}
console.log({checked:rows.length,updated});
