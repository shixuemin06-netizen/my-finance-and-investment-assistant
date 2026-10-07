import DiscoveryPage from '@/components/DiscoveryPage';
import type {StoryQuery} from '@/lib/stories';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<StoryQuery>}){return <DiscoveryPage kind="macro" query={await searchParams}/>;}
