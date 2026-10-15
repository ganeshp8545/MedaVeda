// One invocation is bounded below the cron HTTP timeout even at the 15-second
// provider request ceiling: ceil(40/8)*15 = 75 seconds.
export const WORK_BATCH_SIZE = 40;
export const WORK_CONCURRENCY = 8;
export function estimateDrainSeconds(backlog: number): number {
  return Math.ceil(Math.max(0,backlog) / WORK_BATCH_SIZE) * 60;
}
export async function runBounded<T>(items: readonly T[], concurrency: number,
  work: (item:T)=>Promise<void>): Promise<void> {
  if (!Number.isSafeInteger(concurrency) || concurrency<1) throw new Error('Invalid concurrency');
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(items.length,concurrency)},async()=>{
    while(cursor<items.length) await work(items[cursor++]);
  }));
}
