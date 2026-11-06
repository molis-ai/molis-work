import type {PluginOwnerFilesClient,PluginOwnerFilesReader,PluginOwnerFilesWriter} from '@molis-ai/molis-work-contracts/platform/plugin';
import {createShelfCatalog,type ShelfSyncOptions} from './sync-catalog.js';
import {emptyShelfCatalog,readCurrentCatalog,type CatalogFile} from './catalog-shape.js';
import {shelfErrors} from './errors.js';

/** A local catalog uses the same envelope on its first opening and every later read. */
export function readLocalShelfCatalog(reader:PluginOwnerFilesReader):CatalogFile {
 const bytes=reader.read('catalog.json');
 if(!bytes)return emptyShelfCatalog();
 const raw=JSON.parse(Buffer.from(bytes).toString('utf8'));
 if(!raw||raw.replication!==null)throw shelfErrors.invalid_file('Shelf 本地目录格式不符，原文件已保留');
 const {replication:_replication,...data}=raw;
 return readCurrentCatalog(data);
}

/** File authority and the sync CAS protect the same catalog; the expected document is never refreshed for an old edit. */
export function createShelfFilesCatalog(files:PluginOwnerFilesClient,sync?:ShelfSyncOptions,idle?:(catalog:CatalogFile,key:string)=>void){
 const document=sync?createShelfCatalog(sync,idle):undefined;
 const observed=new WeakMap<CatalogFile,string>();
 return {
  replica:document?.replica,collect:document?.collect,
  read(reader:PluginOwnerFilesReader=files):CatalogFile{
   if(document)reader.stat('catalog.json');
   const value=document?document.read():readLocalShelfCatalog(reader);
   observed.set(value,JSON.stringify(value));return value;
  },
  save(writer:PluginOwnerFilesWriter,value:CatalogFile){
   writer.stat('catalog.json');
   readCurrentCatalog(value);
   const expected=observed.get(value);observed.delete(value);
   if(expected===undefined)throw shelfErrors.conflict('目录缺少读取前提');
   if(document)document.update(current=>{
    if(JSON.stringify(current)!==expected)throw shelfErrors.conflict('目录已变化，修改未覆盖');
    Object.assign(current,value);
   });
   else writer.replaceFileAtomic('catalog.json',Buffer.from(JSON.stringify({...value,replication:null})));
  }
 };
}
