import {join} from 'node:path';
import type {ReplicaDatabase} from '@molis-ai/molis-work-storage';
import {initializeReplica,queueReplicaChange,readDatabaseSpace,replicaTransaction,retainLocalReplicaSnapshot} from '@molis-ai/molis-work-storage';
import type {ImageJob} from '@molis-ai/molis-work-contracts/modules/images';
import {readPortableImage} from './sync-files.js';
import {imagesErrors} from './error.js';
const columns=['id','project_id','connection_name','api_format','model','prompt','size','aspect_ratio','status','error','created_at','finished_at'] as const;
/** Freeze complete original bytes in the same transaction before removing the owner row. No server clock is inferred. */
export function deleteRetainingImage(db:ReplicaDatabase,home:string,job:ImageJob):void {
 replicaTransaction(db,()=>{
  const current=db.prepare('SELECT * FROM jobs WHERE project_id=? AND id=?').get(job.project_id,job.id);
  if(!current||current.status==='running')throw imagesErrors.running('请先停止生成，再删除记录。');
  const space=readDatabaseSpace(db);
  if(space?.kind==='personal'){
   initializeReplica(db);
   const images=(JSON.parse(String(current.images_json)) as ImageJob['images']).map(image=>readPortableImage(join(home,'images','assets'),image));
   // The local preimage uses the stable project ID as its locator title. It never renames/provisions a project.
   const value={format:1,spaceId:space.spaceId,project:{id:job.project_id,title:job.project_id},record:Object.fromEntries(columns.map(c=>[c,current[c]])),images};
   retainLocalReplicaSnapshot(db,JSON.stringify([job.project_id,'image',job.id]),value,()=>{});
  }
  const result=db.prepare("DELETE FROM jobs WHERE project_id=? AND id=? AND status<>'running'").run(job.project_id,job.id) as {changes:number};
  if(Number(result.changes)!==1)throw imagesErrors.running('请先停止生成，再删除记录。');
  if(space?.kind==='personal')queueReplicaChange(db,JSON.stringify([job.project_id,'image',job.id]));
 });
}
