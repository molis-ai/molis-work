import type { PluginSyncCollectionCopy, PluginSyncCollectionOwner, PluginSyncBusinessReader } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { AggregateCopyContext, ReplicaDatabase } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { ProjectCopyAsset, ProjectCopyOwner } from '@molis-ai/molis-work-contracts/services/placement';
import { hasReplicaHistory, replicaTransaction } from './replica.js';
import { readDatabaseSpace } from './space.js';
import { syncError } from './project-replica-sync-errors.js';
/** The owner defines content; the platform enforces the transaction, space and no-revival rule shared by all custom copies. */
export function createCollectionCopy(db: ReplicaDatabase, business: PluginSyncBusinessReader, owner: PluginSyncCollectionOwner, strategy: PluginSyncCollectionCopy, context: AggregateCopyContext): ProjectCopyOwner {
  const space=readDatabaseSpace(db);
  const check=()=>{context.authorize();if(!space||space.spaceId!==context.spaceId)throw syncError('scope','复制空间已变化');};
  const validate=(asset:ProjectCopyAsset)=>{check();strategy.validate(asset,context);check();};
  const readKey=(key:string)=>{check();const value=owner.read(key);check();if(value===null)return null;const asset={key,value};validate(asset);return asset;};
  return {
    kinds:Object.freeze([strategy.kind]),
    read(reference){check();if(reference.kind!==strategy.kind)throw syncError('scope','复制引用不属于当前插件');return readKey(strategy.key(reference));},
    snapshot(projectId){check();context.project(projectId);return replicaTransaction(db,()=>{const result:ProjectCopyAsset[]=[];for(const key of strategy.keys(business,projectId)){const asset=readKey(key);if(asset)result.push(asset);}check();return result;});},
    references(asset){validate(asset);const result=strategy.references(asset);check();return result;},
    fork(asset,identity){validate(asset);if(context.direction!=='source'||identity.sourceSpaceId!==context.spaceId||identity.targetSpaceId===identity.sourceSpaceId)throw syncError('scope','复制来源或目标无效');const result=strategy.fork(asset,identity);check();return result;},
    apply(asset){check();if(context.direction!=='target'||space?.kind!=='personal')throw syncError('scope','复制只能写入当前个人空间');replicaTransaction(db,()=>{validate(asset);const current=readKey(asset.key);if(current){if(!strategy.equivalent(current.value,asset.value))throw syncError('conflict','目标副本已变化，原内容已保留');check();return;}if(hasReplicaHistory(db,asset.key))throw syncError('conflict','目标副本已有历史，拒绝重新创建');owner.apply(asset.key,asset.value);check();});},
  };
}
