import {realpathSync} from 'node:fs';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

// One Host process may use separate SQLite connections for UI and sync; the guard is bound to the actual Home.
const active=new Map<string,number>();
const errors=defineErrorCodes('host',{sync_execution_busy:'unavailable'});
const key=(home:string,project:string,owner:string,item:string)=>JSON.stringify([realpathSync(home),project,owner,item]);
const projectKey=(home:string,project:string)=>JSON.stringify([realpathSync(home),project]);
/** A lifecycle reservation blocks new work until the final catalog transaction has settled. */
export function assertPassiveProjectAvailable(home:string,project:string):void {
 if(active.has(projectKey(home,project)))throw errors.sync_execution_busy('项目生命周期正在变更，暂不能开始新的操作',{sync_waiting:true});
}
export async function withPassiveProjectChange<T>(home:string,project:string,run:()=>Promise<T>):Promise<T> {
 const id=projectKey(home,project),prefix=id.slice(0,-1)+',';
 if([...active.keys()].some(entry=>entry===id||entry.startsWith(prefix)))throw errors.sync_execution_busy('本机操作尚未结束，原内容已保留',{sync_waiting:true});
 active.set(id,1);
 try{return await run();}finally{active.delete(id);}
}
export function assertPassiveSyncIdle(home:string,project:string,owner:string,item:string):void{
 if(active.has(key(home,project,owner,item)))throw errors.sync_execution_busy('本机操作尚未结束，原内容已保留',{sync_waiting:true});
}
/** Acquire before the first await, release only after the real operation has settled. Not an execution grant. */
export async function withPassiveSyncExecution<T>(home:string,project:string,owner:string,item:string,run:()=>Promise<T>):Promise<T>{
 assertPassiveProjectAvailable(home,project);
 const id=key(home,project,owner,item);active.set(id,(active.get(id)??0)+1);
 try{return await run();}finally{const n=active.get(id)!-1;if(n)active.set(id,n);else active.delete(id);}
}
