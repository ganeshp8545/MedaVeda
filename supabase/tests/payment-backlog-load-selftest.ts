import { runBounded, WORK_BATCH_SIZE, WORK_CONCURRENCY, estimateDrainSeconds } from '../functions/_shared/paymentQueue.ts';
const jobs = Array.from({length:1500}, (_,id)=>({id,attempts:0,dueMinute:0,done:false}));
let minute=0, calls=0;
// Deterministic mocked Google: 1.5 s latency; every twentieth first attempt
// fails transiently, then succeeds. Eight slots serve each one-minute batch.
while (jobs.some(j=>!j.done) && minute<1440) {
  const due=jobs.filter(j=>!j.done && j.dueMinute<=minute).slice(0,WORK_BATCH_SIZE);
  const modeledBatchLatencySeconds=Math.ceil(due.length/WORK_CONCURRENCY)*1.5;
  if (modeledBatchLatencySeconds>=60) throw new Error('F06 modeled batch exceeds cron cadence');
  await runBounded(due,WORK_CONCURRENCY,async job=>{
    calls++; job.attempts++;
    if (job.id%20===0 && job.attempts===1) job.dueMinute=minute+2;
    else job.done=true;
  });
  minute++;
}
if (jobs.some(j=>!j.done) || minute>=1440) throw new Error(`F06 backlog not drained: ${jobs.filter(j=>!j.done).length} remain after ${minute} minutes`);
if (estimateDrainSeconds(1500)>86400) throw new Error('F06 estimated drain exceeds 24 hours');
console.log(`PASS F06 1,500 mocked Google jobs drained in ${minute} minutes; ${calls} calls, 1.5s modeled latency, 5% first-attempt failure`);
