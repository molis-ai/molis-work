import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import path from 'node:path';
import {CasebookError,exact,requiredText} from './contract.js';
import {createCasebookUserActionVerifier} from './user-action.js';
import type {CasebookHttpOptions} from './http.js';
import {normalizeCasebookUrl} from './project-link.js';
/** Private startup-only config. Missing default means off; malformed explicit config never silently enables. */
export function loadCasebookConfiguration(home:string,explicitPath?:string,forbiddenSecrets:readonly string[]=[]):CasebookHttpOptions|undefined{
 let fd:number;
 const file=explicitPath??path.join(home,'config','casebook.json');
 if(!path.isAbsolute(file))throw new CasebookError('invalid_casebook_configuration');
 try{fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if(!explicitPath&&(error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new CasebookError('invalid_casebook_configuration');}
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>65536||(stat.mode&0o077)!==0||(process.getuid&&stat.uid!==process.getuid()))throw new Error();
  const value=JSON.parse(readFileSync(fd,'utf8'));exact(value,['version','grants','restoreProjects','proof','casebookUrl','catalogConnections']);
  if(value.version!==1||!Array.isArray(value.grants)||value.grants.length>100)throw new Error();
  const grants=value.grants.map((g:unknown)=>{exact(g,['token','project_ref']);const row=g as {token:string;project_ref:string};requiredText(row.project_ref);if(typeof row.token!=='string'||row.token.length<32||row.token.length>200||forbiddenSecrets.includes(row.token))throw new Error();return{...row};});
  const catalogConnections=value.catalogConnections??[];
  if(!Array.isArray(catalogConnections)||catalogConnections.length>20)throw new Error();
  const connectionTokens=new Set<string>();
  for(const row of catalogConnections){
   exact(row,['token','actor_ref']);requiredText(row.actor_ref);
   if(typeof row.token!=='string'||row.token.length<32||row.token.length>200||connectionTokens.has(row.token)||
     forbiddenSecrets.includes(row.token)||grants.some((g:{token:string})=>g.token===row.token)||row.token===(value.proof as {secret?:unknown}|undefined)?.secret)throw new Error();
   connectionTokens.add(row.token);
  }
  if(catalogConnections.length&&!value.proof)throw new Error();
  const restoreProjects=value.restoreProjects??[];
  if(!Array.isArray(restoreProjects)||restoreProjects.length>100||restoreProjects.some(x=>typeof x!=='string'||!grants.some((g:{project_ref:string})=>g.project_ref===x)))throw new Error();
  let verifyUserAction:CasebookHttpOptions['verifyUserAction'];
  if(value.proof!==undefined){
   exact(value.proof,['secret','audience']);const proof=value.proof;
   if(typeof proof.secret!=='string'||typeof proof.audience!=='string'||grants.some((g:{token:string})=>g.token===proof.secret)||forbiddenSecrets.includes(proof.secret))throw new Error();
   verifyUserAction=createCasebookUserActionVerifier({secret:proof.secret,audience:proof.audience});
  }
  const casebookUrl=value.casebookUrl===undefined?undefined:normalizeCasebookUrl(value.casebookUrl);
  return{grants,restoreProjects,verifyUserAction,casebookUrl,...(catalogConnections.length?{catalogConnections}:{})};
 }catch{throw new CasebookError('invalid_casebook_configuration');}finally{closeSync(fd);}
}
