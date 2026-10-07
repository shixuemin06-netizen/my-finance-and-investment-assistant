import {currentUserContext} from '@/lib/capabilities';
import {usageToday} from '@/lib/model-usage';
export const dynamic='force-dynamic';
export function GET(){return Response.json({user:currentUserContext(),usage:usageToday()},{headers:{'Cache-Control':'no-store'}});}
