import type {SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createHash } from 'node:crypto';
import type { SyncDocumentOwner } from '@molis-ai/molis-work-plugin-sdk';
import type { CatalogFile, StoredItem } from './catalog-shape.js';
import type { ShelfSyncOptions } from './catalog.js';
import { SHELF_PORTABLE_ITEM_FIELDS, SHELF_PORTABLE_JOB_FIELDS, shelfSyncKey, validateShelfPortable, type ShelfPortableRecord, type ShelfPortableJob } from './sync-shape.js';
import { readShelfPortableFiles, stageShelfPortableFiles } from './sync-files.js';

function fields(value:object,keys:readonly string[]):Record<string,unknown>{
  return Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,Reflect.get(value,key)]));
}
function portableItem(item:StoredItem):ShelfPortableRecord{
  const source=item.artifact_source;
  return {...fields(item,[...SHELF_PORTABLE_ITEM_FIELDS,'material_coverage']),
    ...(source?{artifact_source:{project_id:source.project_id,reference:source.reference,producer_plugin_id:source.producer_plugin_id,content_hash:source.content_hash}}:{}),
    // Execution diagnostics can contain workspaces or provider details, not portable business content.
    failure_reason:item.failure_reason===null?null:'此任务未生成完整结果',
  } as ShelfPortableRecord;
}
function portableJob(job:CatalogFile['jobs'][number]):ShelfPortableJob{return fields(job,[...SHELF_PORTABLE_JOB_FIELDS,'material_coverage']) as ShelfPortableJob;}
function token(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}

/** Each material/result and terminal job has its own conflict key; device settings and live jobs never enter this projection. */
export function shelfCatalogOwner(root:string,context:ShelfSyncOptions,assertIdle?: (catalog:CatalogFile,key:string)=>void):Pick<SyncDocumentOwner<CatalogFile>,'spaceId'|'authorize'|'observe'|'read'|'apply'|'canUpload'>{
  return {spaceId:context.spaceId,authorize:context.authorize,
    observe(data){return new Map([
      ...data.items.map(item=>[JSON.stringify(['item',item.item_id]),token(portableItem(item))] as const),
      ...data.jobs.filter(job=>job.status!=='running').map(job=>[JSON.stringify(['job',job.job_id]),token(portableJob(job))] as const),
    ]);},
    read(data,key){
      const {kind,id}=shelfSyncKey(key);
      const item=kind==='item'?data.items.find(item=>item.item_id===id):undefined,job=kind==='job'?data.jobs.find(job=>job.job_id===id&&job.status!=='running'):undefined;
      if(!item&&!job)return null;
      const record=item?portableItem(item):undefined;
      return validateShelfPortable({format:1,spaceId:context.spaceId,items:item&&record?[{record,files:readShelfPortableFiles(root,item.relative_path,record)}]:[],jobs:job?[portableJob(job)]:[]},context.spaceId,key);
    },
    canUpload(data,key){try{assertIdle?.(data,key);return true;}catch(error){if(error&&typeof error==='object'&&'details' in error&&error.details&&typeof error.details==='object'&&'sync_waiting' in error.details&&error.details.sync_waiting===true)return false;throw error;}},
    apply(data,key,input){
      const {kind,id}=shelfSyncKey(key),value=input===null?null:validateShelfPortable(input,context.spaceId,key);
      context.authorize();assertIdle?.(data,key);
      if(kind==='item'){
        const incoming=value?.items[0],old=data.items.find(row=>row.item_id===id);
        if(incoming){
          const relative=stageShelfPortableFiles(root,incoming,context.authorize),{artifact_source:source,...record}=incoming.record;
          const localSource=old?.artifact_source;
          const item:StoredItem={...record,relative_path:relative,origin_realpath:old?.origin_hash===incoming.record.origin_hash?old.origin_realpath:null,
            ...(source?{artifact_source:{...source,project_path:localSource?.project_id===source.project_id?localSource.project_path:''}}:{})};
          data.items=data.items.filter(row=>row.item_id!==id);data.items.unshift(item);
        }else data.items=data.items.filter(row=>row.item_id!==id);
      }else{
        const incoming=value?.jobs[0];data.jobs=data.jobs.filter(row=>row.job_id!==id);
        if(incoming)data.jobs.unshift({...incoming,runtime:'',isolation:'',error:incoming.status==='failed'?'此任务未成功完成':null});
      }
      context.authorize();data.seeded_sample=true;
    },
  };
}

/** Independent Home copies retain provenance, never project ownership. Cursor access preserves the account/format fence. */
export function shelfHomeReplica(replica:SyncReplicaAdapter,collect?:()=>number):SyncReplicaAdapter {
 return {...replica,...(collect?{maintain(){replica.cursor();collect();replica.cursor();}}:{}),hasProjectChanges(_projectId){replica.cursor();return false;},locate(key){replica.cursor();const {id}=shelfSyncKey(key);return '/?openPlugin=shelf&openItem='+encodeURIComponent(id);}};
}
