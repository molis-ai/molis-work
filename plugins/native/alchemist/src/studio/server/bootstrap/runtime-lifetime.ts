import {actionsInFlight} from './actor-actions.js';
import {registerStudioSyncGuard} from '../sync/activity.js';
import type {SqliteDatabase} from '../db/open-database.js';
import type {SqliteJobRunner} from '../jobs/sqlite-job-runner.js';
import type {LocalWorker} from '../jobs/local-worker.js';

/** One original runtime lifecycle, including passive sync exclusion while a foreground action awaits a provider. */
export function studioRuntimeLifetime(options:{database:SqliteDatabase;databasePath:string;jobs:SqliteJobRunner;worker:LocalWorker;workerIntervalMs?:number}){
 let interval:NodeJS.Timeout|undefined,draining:Promise<void>|undefined,closing:Promise<void>|undefined,closed=false;
 const inFlight=actionsInFlight();
 const idle=()=>!closed&&!draining&&inFlight.none()&&!options.jobs.hasActive();
 const unregister=registerStudioSyncGuard(options.databasePath,idle);
 const runPending=():Promise<void>=>{
  if(draining)return draining;if(closed)return Promise.resolve();
  draining=(async()=>{options.jobs.recoverExpired();while(!closed&&await options.worker.runNext()){/* drain sequentially */}})().finally(()=>{draining=undefined;});return draining;
 };
 return {
  idle,runPending,track:inFlight.track,isClosed:()=>closed,
  start(){if(interval||closed)return;void runPending();interval=setInterval(()=>void runPending(),options.workerIntervalMs??250);interval.unref();},
  close(){
   if(closing)return closing;closed=true;if(interval)clearInterval(interval);options.worker.stop();
   closing=(async()=>{try{await draining;await options.worker.whenIdle();}finally{try{options.database.close();}finally{unregister();}}})();return closing;
  },
 };
}
