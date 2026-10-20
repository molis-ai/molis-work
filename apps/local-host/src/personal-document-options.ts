import path from 'node:path';
import { lstatSync, existsSync } from 'node:fs';
import { createAtomicFileDocument, ensureStorageSpace } from '@molis-ai/molis-work-storage';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const errors=defineErrorCodes('host',{sync_document_path:'invalid'});
/** Trusted catalog supplies a fixed owner-relative document, never an HTTP path or network value. */
export function personalDocumentOptions(home:string,relative:string,authorize:()=>void=()=>{}){
  const space=ensureStorageSpace(home);if(space.kind!=='personal')return undefined;
  const root=path.resolve(home),filename=path.resolve(root,relative);
  if(!filename.startsWith(root+path.sep)||relative.includes('\\')||relative.split('/').some(part=>!part||part==='.'||part==='..'))throw errors.sync_document_path('同步文档不属于当前空间');
  const check=()=>{
    authorize();let current=root;
    for(const part of relative.split('/')){current=path.join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw errors.sync_document_path('同步文档路径包含链接');}
  };
  return {spaceId:space.spaceId,authorize:check,storage:createAtomicFileDocument(filename,check)};
}
