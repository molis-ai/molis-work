import path from 'node:path';
import type {SyncDocumentStorage} from '@molis-ai/molis-work-plugin-sdk';
import {shelfErrors} from './errors.js';
import type {CatalogFile} from './catalog-shape.js';
import {readShelfPortableFiles} from './sync-files.js';

/** Checked CAS must verify reused old staging files after taking the same mutex as collection. */
export function verifyShelfFileCommit(files:NonNullable<SyncDocumentStorage['files']>,next:CatalogFile,previous:CatalogFile|null):void {
 const old=new Map(previous?.items.map(item=>[item.item_id,item])??[]);
 for(const item of next.items){const before=old.get(item.item_id);if(!before||before.relative_path!==item.relative_path||before.copy_hash!==item.copy_hash)readShelfPortableFiles(files,item.relative_path,item);}
}
/** Keep current owner paths under a shared file-CAS mutex. Never traverse links or sweep arbitrary Home directories. */
export function createShelfFileCollector(files:NonNullable<SyncDocumentStorage['files']>,storage:SyncDocumentStorage,read:()=>CatalogFile,authorize:()=>void):()=>number {
 // Ephemeral traversal position only. Restart safely scans again; no open directory handles or business changes.
 let frames:{relative:string;after:string|null}[]=[];
 return ()=>{
  if(!storage.withReadLock||!storage.compareAndSetChecked)return 0;
  try{return storage.withReadLock(()=>{
   authorize();const catalog=read(),keep=catalog.items.filter(item=>item.relative_path).map(item=>path.normalize(item.relative_path)),directory='files';let removed=0,visited=0;
   const safeDirectory=(relative:string)=>{
    let current=directory;for(const part of ['',...relative.split(path.sep).filter(Boolean)]){if(part)current=path.join(current,part);const stat=files.stat(current);if(!stat||stat.kind!=='directory')return false;}return true;
   };
   if(!safeDirectory('')){frames=[];return 0;}if(!frames.length)frames=[{relative:'',after:null}];
   const opened=new Map<string,{entries:readonly {name:string;kind:string}[];index:number}>();
   while(frames.length&&removed<20&&visited<5000){
    authorize();const frame=frames[frames.length-1]!;
    if(!safeDirectory(frame.relative)){frames.pop();continue;}
    const current=path.join(directory,frame.relative);
    let listing=opened.get(frame.relative);if(!listing){const entries=files.list(current);listing={entries,index:entries.findIndex(entry=>frame.after===null||entry.name>frame.after)};if(listing.index<0)listing.index=entries.length;opened.set(frame.relative,listing);}
    // The cursor advances for retained, unknown and linked entries too, so none can starve later candidates.
    if(listing.index>=listing.entries.length){frames.pop();continue;}
    while(listing.index<listing.entries.length){
     if(removed>=20||visited>=5000)break;const entry=listing.entries[listing.index++]!;authorize();frame.after=entry.name;visited++;const filename=path.join(current,entry.name);
     if(entry.kind==='unsafe')continue;
     if(keep.some(retained=>retained===filename||filename.startsWith(retained+path.sep)))continue;
     if(entry.kind==='directory'){if(frames.length<100)frames.push({relative:path.relative(directory,filename),after:null});break;}
     const relative=path.relative(directory,filename).split(path.sep);
     if(!/^item_[a-z0-9]+_[a-f0-9]{8}$/.test(relative[0]??'')||relative[1]==='versions'&&!/^[a-f0-9]{64}$/.test(relative[2]??''))continue;
     try{const stat=files.stat(filename);if(!stat||stat.kind!=='file'||stat.modifiedAt>Date.now()-86400000)continue;authorize();files.removeFile(filename);removed++;}catch{/* Failed candidates stay intact and are considered again after traversal wraps. */}
    }
   }
   authorize();return removed;
  });}catch{frames=[];authorize();throw shelfErrors.sync_unavailable('置物架暂存清理暂不可用，保留原件等待下次检查');}
 };
}
