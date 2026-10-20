import type {SpaceSyncPolicy} from '@molis-ai/molis-work-contracts/modules/sync-replication';
import type {SyncRegistration} from './index.js';
import {syncError} from './sync-errors.js';
import {syncNamespace as key} from './namespace.js';
/** A selected but absent/disabled format is incomplete, not a successful empty sync. Healthy owners still run. */
export function unavailableSyncSelections(registrations:readonly SyncRegistration[],policy:SpaceSyncPolicy):string[]{
 const known=new Set(registrations.map(row=>key(row.selection)));
 const missing=policy.selections.filter(selection=>!known.has(key(selection)));
 return missing.length?[`${missing.length} 个已选同步集合不可用，请检查插件或格式版本`]:[];
}
/** Check the complete registered dependency closure. Never add a selection or substitute another publisher/version. */
export function assertSyncDependencies(root:SyncRegistration,registrations:readonly SyncRegistration[],policy:SpaceSyncPolicy):void{
 const selected=new Set(policy.selections.map(key)),known=new Map(registrations.map(r=>[key(r.selection),r])),done=new Set<string>(),active=new Set<string>();
 const visit=(row:SyncRegistration)=>{const identity=key(row.selection);if(done.has(identity))return;if(active.has(identity))throw syncError('dependencies','同步集合依赖存在循环');active.add(identity);
  for(const dependency of row.dependencies??[]){const id=key(dependency),required=known.get(id);if(!selected.has(id)||!required)throw syncError('dependencies','请同时选择已接入的依赖集合：'+dependency.collection_id);visit(required);}
  active.delete(identity);done.add(identity);
 };visit(root);
}
