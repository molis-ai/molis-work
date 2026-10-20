import type {IncomingMessage,ServerResponse} from 'node:http';
import {ActionError,LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';
import {actionErrorResponse} from '@molis-ai/molis-work-plugin-sdk';
import {ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {readLocalWebBody,sendLocalWebJson} from './web-http.js';
import {ProjectDeletionService,type ProjectDeletionPorts} from './project-deletion-service.js';
import {PERSONAL_SPACE_PROJECT_ID} from './personal-space.js';
import type {LocalWebCatalogRunner} from './web-project-settings.js';
/** Mounted behind the existing settings Origin/control/mutation gate. Actor and Home come from that boundary. */
export async function handleProjectRecycleHttp(request:IncomingMessage,response:ServerResponse,url:URL,home:string,withCatalog:LocalWebCatalogRunner,ports:ProjectDeletionPorts):Promise<boolean>{
 const match=url.pathname.match(/^\/api\/settings\/projects(?:\/([^/]+))?\/recycle$/);if(!match)return false;
 const check=()=>{if(request.aborted||response.destroyed)throw new ActionError('actions.forbidden','请求已失效，项目原件已保留');};
 try{
  check();const space=ensureStorageSpace(home);if(request.headers['x-molis-sync-space']&&request.headers['x-molis-sync-space']!==space.spaceId)throw new ActionError('actions.forbidden','个人空间已变化，请重新打开');if(space.kind!=='personal')throw new ActionError('actions.forbidden','项目回收仅在个人空间中可用');
  if(request.method==='GET'){
   const items=await withCatalog({homeDirectory:home},catalog=>{
    const ids=match[1]?[decodeURIComponent(match[1])]:[...catalog.listProjects().filter(p=>p.data_class==='user'&&p.project_id!==PERSONAL_SPACE_PROJECT_ID).map(p=>p.project_id),...catalog.recycle.list().map(p=>p.project_id)];
    return ids.map(id=>{const {database_path:_path,...item}=catalog.recycle.inspect(id);return item;});
   });check();sendLocalWebJson(response,200,{items});return true;
  }
  if(request.method!=='POST'||!match[1])throw new ActionError('actions.input_invalid','项目回收操作无效');
  const body=await readLocalWebBody(request);check();
  if(Object.keys(body).some(key=>!['recycled','confirmed','expected_state','operation_id'].includes(key)))throw new ActionError('actions.input_invalid','项目回收参数无效');
  const result=await new ProjectDeletionService(withCatalog,ports).changeRecycled(home,{project_id:decodeURIComponent(match[1]),actor_id:LOCAL_PERSON_ACTOR_ID,recycled:body.recycled as boolean,confirmed:body.confirmed as boolean,expected_state:body.expected_state as string,operation_id:body.operation_id as string},check);
  const {database_path:_path,...item}=result;sendLocalWebJson(response,200,item);
 }catch(error){const failure=actionErrorResponse(error);sendLocalWebJson(response,failure.status,failure.body);}
 return true;
}
