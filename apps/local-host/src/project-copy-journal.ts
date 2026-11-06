import {mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createAtomicFileDocument,readStorageSpace} from '@molis-ai/molis-work-storage';
import {createProjectCopyJournal} from '@molis-ai/molis-work-service-placement';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

const errors=defineErrorCodes('host',{copy_space_refused:'forbidden'});
/** Trusted target Home composition, without starting a Host, Runtime or sync loop. */
export function openProjectCopyJournal(home:string,targetSpaceId:string,authorize:()=>void){
 const root=resolve(home),directory=join(root,'placement');let opened=false;
 const check=()=>{authorize();const space=readStorageSpace(root);if(space?.kind!=='personal'||space.spaceId!==targetSpaceId)throw errors.copy_space_refused('复制目标不属于当前个人空间');if(opened){try{const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(directory)!==join(realpathSync(root),'placement'))throw errors.copy_space_refused('复制回执目录已变化');}catch{throw errors.copy_space_refused('复制回执目录已变化');}}};
 check();
 try{const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw errors.copy_space_refused('复制回执目录无效');}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'){check();mkdirSync(directory,{mode:0o700});}else throw error;}
 if(realpathSync(directory)!==join(realpathSync(root),'placement'))throw errors.copy_space_refused('复制回执目录不属于目标空间');
 opened=true;
 const storage=createAtomicFileDocument(join(directory,'project-copies.json'),check);return createProjectCopyJournal(storage,targetSpaceId,check);
}
