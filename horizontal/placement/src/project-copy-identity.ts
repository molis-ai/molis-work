import {createHash} from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {ProjectCopyIdentity} from '@molis-ai/molis-work-contracts/services/placement';

const errors=defineErrorCodes('placement',{copy_scope:'invalid'});
export interface ProjectCopyIdentityInput {
 readonly operationId:string;
 readonly sourceSpaceId:string;
 readonly targetSpaceId:string;
 readonly projects:readonly {readonly id:string;readonly title:string}[];
}
/** Pure mapping for a persisted operation identity. This function is not itself a durable receipt. */
export function projectCopyIdentities(input:ProjectCopyIdentityInput):{project(id:string):string;forProject(id:string|null):ProjectCopyIdentity} {
 const {operationId,sourceSpaceId,targetSpaceId}=input,projects=new Map(input.projects.map(project=>[project.id,project.title]));
 if(!operationId||operationId.length>200||!sourceSpaceId||!targetSpaceId||sourceSpaceId===targetSpaceId||!projects.size||projects.size!==input.projects.length||[...projects].some(([id,title])=>!id||id==='personal'||id.length>80||!title.trim()||title.length>120))throw errors.copy_scope('复制请求、空间或项目身份无效');
 const uuid=(parts:readonly (string|null)[])=>{const hex=createHash('sha256').update(JSON.stringify(['molis.project-copy',1,sourceSpaceId,targetSpaceId,operationId,...parts])).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-8'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);};
 const project=(id:string)=>{if(!projects.has(id))throw errors.copy_scope('项目未包含在确认的复制选择中');return 'project-'+uuid(['project',id]);};
 return {project,forProject(id){
  if(id!==null&&!projects.has(id))throw errors.copy_scope('项目未包含在确认的复制选择中');
  return Object.freeze({sourceSpaceId,targetSpaceId,sourceProjectId:id,targetProjectId:id===null?null:project(id),targetTitle:id===null?'个人空间':projects.get(id)!,
   project(source:string|null){return source===null?null:project(source);},
   id(kind:string,sourceId:string,sourceProjectId:string|null=id){
    if(typeof kind!=='string'||!kind||kind.length>300||typeof sourceId!=='string'||!sourceId||sourceId.length>240||sourceProjectId!==null&&!projects.has(sourceProjectId))throw errors.copy_scope('复制对象未包含在确认的映射中');
    return 'copy_'+uuid(['asset',kind,sourceProjectId,sourceId]);
   },
  });
 }};
}
