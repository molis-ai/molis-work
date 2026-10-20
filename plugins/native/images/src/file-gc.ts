import {lstatSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import type {ReplicaDatabase} from '@molis-ai/molis-work-storage';
/** Only old, owner-named files unreferenced by every current job. Retained snapshots contain their own complete bytes. */
export function collectImageFiles(db:ReplicaDatabase,home:string):number {
 const directory=join(home,'images','assets');let entries:string[];
 try{const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())return 0;entries=readdirSync(directory);}catch{return 0;}
 db.exec('BEGIN IMMEDIATE');let removed=0;
 try{
  const references=new Set(db.prepare("SELECT json_extract(i.value,'$.filename') AS filename FROM jobs j,json_each(j.images_json) i").all().map(row=>String(row.filename)));
  for(const filename of entries.sort()){
   if(removed>=20)break;if(!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(filename)||references.has(filename))continue;
   const path=join(directory,filename);try{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.mtimeMs>Date.now()-86400000)continue;rmSync(path);removed++;}catch{/* Retain a failed cleanup candidate; the next owner pass retries. */}
  }
  db.exec('COMMIT');return removed;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
