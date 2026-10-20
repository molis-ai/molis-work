import type {IncomingMessage,ServerResponse} from 'node:http';
import type {PersonalSync} from '@molis-ai/molis-work-module-sync-replication';
import {readLocalWebBody,sendLocalWebJson} from './web-http.js';

/** The caller has already checked the current space, Origin, control token and mutation key. */
export async function serveSpaceSync(input:{request:IncomingMessage;response:ServerResponse;url:URL;local:boolean;service():Promise<PersonalSync|null>}){
  const {request,response,url}=input,query=url.searchParams,namespace=query.get('namespace')??'',key=query.get('key')??'';
  try{
    // Trial releases retain originals: refuse before opening any sync service or contacting a server.
    if(request.method!=='GET'&&(url.pathname==='/api/sync/purge-trash'||url.pathname==='/api/sync/history/purge')){sendLocalWebJson(response,409,{error:'永久清理暂未开放，保留内容仍计入云端容量。'});return;}
    const service=await input.service();
    if(!service){sendLocalWebJson(response,200,{available:false,reason:input.local?'本地空间不参与同步，请先切换到个人空间。':'尚未配置同步服务。'});return;}
    if(request.method==='GET'){
      let value:unknown;
      switch(url.pathname){
        case '/api/sync':await service.refreshCatalog();value={available:true,...service.status()};break;
        case '/api/sync/conflict':value=service.inspectConflict(namespace,key);break;
        case '/api/sync/recoveries':value={items:service.recoveries(namespace)};break;
        case '/api/sync/recovery':value=service.inspectRecovery(namespace,query.get('id')??'');break;
        case '/api/sync/trash':value=await service.trash(query.has('before')?Number(query.get('before')):undefined);break;
        case '/api/sync/history/keys':value=await service.history.keys(namespace,query.get('after')??undefined);break;
        case '/api/sync/history':value=await service.history.versions(namespace,key,query.has('before')?Number(query.get('before')):undefined);break;
        case '/api/sync/history/version':value=await service.history.inspect(namespace,key,Number(query.get('revision')));break;
        default:sendLocalWebJson(response,404,{error:'接口不存在。'});return;
      }
      sendLocalWebJson(response,200,value);return;
    }
    const body=await readLocalWebBody(request);
    if(request.method==='PUT'&&url.pathname==='/api/sync/device')await service.setDevice(body.automatic);
    else if(request.method==='PUT'&&url.pathname==='/api/sync/policy')await service.save(body);
    else if(request.method==='POST'){
      const ns=String(body.namespace),asset=String(body.key),revision=Number(body.revision);
      switch(url.pathname){
        case '/api/sync/run':await service.run();break;
        case '/api/sync/retry-item':await service.retryItem(ns,asset,body.direction as 'upload'|'download');break;
        case '/api/sync/resolve':
          if(!Number.isSafeInteger(body.revision)||typeof body.state!=='string'||!/^[a-f0-9]{64}$/.test(body.state))throw new Error('请先查看当前冲突版本');
          await service.resolve(ns,asset,body.choice as 'local'|'remote',revision,body.state);break;
        case '/api/sync/restore-recovery':await service.restoreRecovery(ns,String(body.id),body.choice as 'local'|'remote',revision);break;
        case '/api/sync/restore-trash':await service.restoreTrash(ns,asset,revision,String(body.operationId));break;
        case '/api/sync/history/restore':await service.history.restore(ns,asset,Number(body.sourceRevision),revision,String(body.operationId));break;
        default:sendLocalWebJson(response,404,{error:'接口不存在。'});return;
      }
    }else{sendLocalWebJson(response,404,{error:'接口不存在。'});return;}
    sendLocalWebJson(response,200,{available:true,...service.status()});
  }catch(error){sendLocalWebJson(response,409,{error:error instanceof Error?error.message:'同步暂时不可用'});}
}
