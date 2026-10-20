import {resolve} from 'node:path';
import {studioSyncErrors} from './errors.js';

const guards=new Map<string,Set<()=>boolean>>();
/** The runtime owns foreground/action/job liveness. Sync does not construct it to discover this fact. */
export function registerStudioSyncGuard(path:string,idle:()=>boolean):()=>void {
 const key=resolve(path),set=guards.get(key)??new Set();set.add(idle);guards.set(key,set);
 return ()=>{set.delete(idle);if(!set.size)guards.delete(key);};
}
export function assertStudioSyncIdle(path:string):void {
 for(const idle of guards.get(resolve(path))??[])if(!idle())throw studioSyncErrors.sync_busy('炼金术士仍在本机处理，稍后再同步');
}
