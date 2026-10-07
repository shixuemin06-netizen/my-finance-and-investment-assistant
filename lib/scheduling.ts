export const UPDATE_INTERVAL=60*60*1000;
export function updateDue(lastAttempt:string|null|undefined,lastSuccess:string|null|undefined,now=Date.now()){
 // Attempts also throttle retries after a complete outage; missed hours never accumulate.
 const recent=Math.max(Date.parse(lastAttempt||'')||0,Date.parse(lastSuccess||'')||0);
 return now-recent>=UPDATE_INTERVAL;
}
export async function runSummaryBatches(batch:()=>Promise<number>,shouldStop:()=>boolean=()=>false){
 let done=0;
 for(let i=0;i<8&&!shouldStop();i++){const n=await batch();done+=n;if(n<5)break;}
 return done;
}
