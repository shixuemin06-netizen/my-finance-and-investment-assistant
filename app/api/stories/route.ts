import {queryStories} from '@/lib/stories';
export const dynamic='force-dynamic';
export async function GET(request:Request){const q=Object.fromEntries(new URL(request.url).searchParams);return Response.json(queryStories(q));}
