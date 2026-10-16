import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import type { Duplex } from 'node:stream';
import { ensureStorageSpace, personalStorageSpace, resolveMolisWorkHome, runWithMolisWorkHome, type StorageSpace } from '@molis-ai/molis-work-storage';
import { createPersonalAccountHttp } from './personal-http.js';
import { createPersonalNativeSession } from './personal-native-session.js';
import { personalCloudConfig } from './personal-auth.js';
import { resolveWebControlToken } from './web-control-token.js';
import { authorizeLocalWebRequest, refuseForeignRequest, refuseLocalWebRequest, requestHost, sendLocalWebJson, type LocalMutationState } from './web-http.js';
import type { WebServerOptions } from './web-types.js';
import { ACTION_GATEWAY_PATH, actionGatewayHomeId } from './action-gateway.js';
import { createPersonalSync } from './personal-sync.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import { readLocalWebBody } from './web-http.js';

interface Surface {
  home:string; space:StorageSpace; token:string; server:SpaceWebSurface;
  users:Map<string,()=>boolean>; connections:Map<Duplex,()=>boolean>; responses:Map<ServerResponse,()=>boolean>;
}

export interface SpaceWebSurface extends http.Server {
  /** Resolves after the runtime and background writers have released their Home. */
  spaceDisposed?:Promise<void>;
}

function createSpaceContext(options:WebServerOptions,createCore:(options:WebServerOptions)=>SpaceWebSurface,withCatalog:LocalWebCatalogRunner|undefined,address:()=>ReturnType<http.Server["address"]>){
  const home=path.resolve(options.homeDirectory??resolveMolisWorkHome());
  const local=ensureStorageSpace(home);
  const native=createPersonalNativeSession(home);
  const account=runWithMolisWorkHome(home,()=>createPersonalAccountHttp(native));
  const rootToken=resolveWebControlToken({...options,homeDirectory:home});
  const mutations=new Map<string,LocalMutationState>();
  const surfaces=new Map<string,Surface>();
  const retiring=new Map<string,Promise<void>>();
  let stopping=false;
  const syncs=new Map<string,{active:()=>boolean;service:Awaited<ReturnType<typeof createPersonalSync>>}>();
  const syncStarts=new Map<string,Promise<void>>();
  const syncFor=async(selected:ReturnType<typeof selection>,request:IncomingMessage)=>{
    if(selected.space.kind!=='personal'||!withCatalog)return null;
    const id=selected.space.spaceId;
    if(syncStarts.has(id))await syncStarts.get(id);
    const old=syncs.get(id);if(old?.active())return old.service;
    old?.service?.close();syncs.delete(id);
    const lease=selected.session!.auth.accountLease();
    const active=()=>{try{lease.assertCurrent();return !stopping&&selection(request).space.spaceId===id;}catch{return false;}};
    const start=(async()=>{
      const service=await createPersonalSync(selected.directory,selected.space,lease,withCatalog,()=>{if(!active())throw new Error('SYNC_ACCOUNT_CHANGED');});
      if(!active()){service?.close();return;}
      syncs.set(id,{active,service});
    })();
    syncStarts.set(id,start);try{await start;}finally{syncStarts.delete(id);}
    return syncs.get(id)?.service??null;
  };

  const selection=(request:IncomingMessage)=>{
    const session=account.context(request);
    const identity=session?.auth.identity();
    const space=session?.space==='account' && identity
      ? personalStorageSpace(personalCloudConfig()!.authOrigin,identity.applicationId,identity.userId):local;
    const directory=space.kind==='local'?home:path.join(home,'spaces',space.spaceId);
    if(space.kind==='personal' && (options.localHost||options.databasePath))throw new Error('SPACE_FIXTURE_NOT_SUPPORTED');
    if(space.kind==='personal'){
      fs.mkdirSync(directory,{recursive:true,mode:0o700});
      if(fs.realpathSync(directory)!==path.join(fs.realpathSync(home),'spaces',space.spaceId))throw new Error('SPACE_DIRECTORY_UNSAFE');
      // Bind before any token/config file is created in a newly selected Home.
      ensureStorageSpace(directory,space);
    }
    return {space,directory,session};
  };
  const surface=async(selected:ReturnType<typeof selection>):Promise<Surface>=>{
    await retiring.get(selected.space.spaceId);
    return openSurface(selected);
  };
  const openSurface=(selected:ReturnType<typeof selection>):Surface=>{
    if(stopping)throw new Error('SPACE_CLOSED');
    let result=surfaces.get(selected.space.spaceId);
    if(result)return result;
    const {directory,space}=selected;
    ensureStorageSpace(directory,space);
    const coreOptions=space.kind==='local'?{...options,homeDirectory:directory}:{homeDirectory:directory};
    const token=space.kind==='local'?rootToken:resolveWebControlToken(coreOptions);
    const core=runWithMolisWorkHome(directory,()=>createCore({...coreOptions,controlToken:token}));
    core.address=address;
    result={home:directory,space,token,server:core,users:new Map(),connections:new Map(),responses:new Map()};
    surfaces.set(space.spaceId,result);
    return result;
  };
  const retire=(entry:Surface)=>{
    surfaces.delete(entry.space.spaceId);
    for(const response of entry.responses.keys())response.destroy();
    for(const socket of entry.connections.keys())socket.destroy();
    const closed=new Promise<void>(resolve=>entry.server.close(()=>resolve()));
    const disposed=Promise.all([closed,entry.server.spaceDisposed]).then(()=>{});
    retiring.set(entry.space.spaceId,disposed);
    void disposed.finally(()=>{if(retiring.get(entry.space.spaceId)===disposed)retiring.delete(entry.space.spaceId);});
  };
  const sweep=()=>{
    for(const [id,entry] of syncs)if(!entry.active()){entry.service?.close();syncs.delete(id);}
    for(const entry of surfaces.values()){
      for(const [response,active] of entry.responses)if(!active())response.destroy();
      for(const [socket,active] of entry.connections)if(!active())socket.destroy();
      if(entry.space.kind==='local')continue;
      for(const [id,active] of entry.users)if(!active())entry.users.delete(id);
      if(!entry.users.size)retire(entry);
    }
  };
  const attach=(entry:Surface,request:IncomingMessage)=>{
    const selected=selection(request);
    if(entry.space.kind==='local')return ()=>selection(request).space.spaceId===entry.space.spaceId;
    if(selected.space.spaceId!==entry.space.spaceId)throw new Error('SPACE_CHANGED');
    const session=selected.session!;
    const lease=session.auth.accountLease();
    const valid=()=>{
      try {lease.assertCurrent();return selection(request).space.spaceId===entry.space.spaceId;}catch{return false;}
    };
    if(!entry.users.has(session.id)){
      entry.users.set(session.id,valid);
      lease.signal.addEventListener('abort',sweep,{once:true});
    }
    return valid;
  };
  const stop=()=>{stopping=true;account.close();for(const entry of syncs.values())entry.service?.close();for(const entry of [...surfaces.values()])retire(entry);};
  return {home,local,native,account,rootToken,mutations,surface,selection,attach,sweep,syncFor,surfaces,retiring,openSurface,stop,isStopping:()=>stopping};
}

/** One public listener. Each scope owns its Host, databases, caches and timers.
 * Child servers are in-process dispatchers: no extra port and no browser-selected Home.
 */
export function createSpaceWebServer(options:WebServerOptions,createCore:(options:WebServerOptions)=>SpaceWebSurface,withCatalog?:LocalWebCatalogRunner):http.Server {
  const {home,local,native,account,rootToken,mutations,surface,selection,attach,sweep,syncFor,surfaces,retiring,openSurface,stop,isStopping}=createSpaceContext(options,createCore,withCatalog,()=>server.address());
  const server=http.createServer((request,response)=>{
    void runWithMolisWorkHome(home,async()=>{
      try {
        if(isStopping()){sendLocalWebJson(response,503,{error:'服务正在关闭。'});return;}
        const url=new URL(request.url??'/','http://localhost');
        if(refuseForeignRequest(request,response))return;
        // CLI/MCP have no browser cookies. Only an already-open, authenticated
        // personal Host can be reached with its exact Home id and private token.
        const gatewayHome=request.headers['x-molis-work-home-id'];
        if(url.pathname===ACTION_GATEWAY_PATH && gatewayHome && gatewayHome!==actionGatewayHomeId(home)){
          const entry=[...surfaces.values()].find(item=>actionGatewayHomeId(item.home)===gatewayHome);
          const active=()=>!!entry && [...entry.users.values()].some(valid=>valid());
          if(entry && active() && request.headers['x-molis-work-control-token']===entry.token){
            entry.responses.set(response,active);response.once('close',()=>entry.responses.delete(response));
            entry.server.emit('request',request,response);return;
          }
          // A valid root credential may reach its own gate, which reports the Home mismatch.
          // An unknown/retired space credential still gets only the opaque control refusal.
          if(request.headers['x-molis-work-control-token']===rootToken){surfaces.get(local.spaceId)!.server.emit('request',request,response);return;}
          refuseLocalWebRequest(response);return;
        }
        const selected=selection(request);
        const token=selected.space.kind==='local'?rootToken:resolveWebControlToken({homeDirectory:selected.directory});
        const accountPath=url.pathname.startsWith('/api/personal/')||['/account','/account/callback','/welcome'].includes(url.pathname);
        const address=server.address();
        const origin=`http://127.0.0.1:${address&&typeof address==='object'?address.port:4173}`;
        if(url.pathname.startsWith('/api/sync')){
          if(request.headers['x-molis-work-control-token']!==token){sendLocalWebJson(response,403,{error:'空间已切换，请刷新页面。'});return;}
          if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
          try{
            const service=await syncFor(selected,request);
            if(!service){sendLocalWebJson(response,200,{available:false,reason:selected.space.kind==='local'?'本地空间不参与同步，请先切换到个人空间。':'尚未启用本机同步联调。'});return;}
            if(request.method==='GET'&&url.pathname==='/api/sync'){await service.loadPolicy();sendLocalWebJson(response,200,{available:true,...service.status()});return;}
            if(request.method==='POST'&&url.pathname==='/api/sync/run'){await service.run();service.start();}
            else if(request.method==='PUT'&&url.pathname==='/api/sync/policy'){await service.save(await readLocalWebBody(request));service.start();}
            else if(request.method==='POST'&&url.pathname==='/api/sync/resolve'){const body=await readLocalWebBody(request);await service.resolve(String(body.namespace),String(body.key),body.choice as 'local'|'remote');}
            else {sendLocalWebJson(response,404,{error:'接口不存在。'});return;}
            sendLocalWebJson(response,200,{available:true,...service.status()});
          }catch(error){sendLocalWebJson(response,409,{error:error instanceof Error?error.message:'同步暂时不可用'});}
          return;
        }
        if(accountPath){
          if(!authorizeLocalWebRequest(request,response,url,native(request)?rootToken:token,mutations))return;
          if(!await account(request,response,url,origin,token,''))sendLocalWebJson(response,404,{error:'接口不存在。'});
          sweep();return;
        }
        if(url.pathname==='/api/spaces'){
          if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
          if(request.method!=='GET'){sendLocalWebJson(response,405,{error:'不支持此操作。'});return;}
          const identity=selected.session?.auth.identity();
          const personal=identity?personalStorageSpace(personalCloudConfig()!.authOrigin,identity.applicationId,identity.userId):null;
          sendLocalWebJson(response,200,{current:selected.space,spaces:[local,...(personal?[personal]:[])],syncEnabled:false});return;
        }
        // A stale page cannot use another scope's control token, including on GET APIs.
        const supplied=request.headers['x-molis-work-control-token'];
        if(supplied && supplied!==token){
          // Preserve the existing forbidden-mutation contract. Stale reads get
          // an explicit conflict instead of loading another space into the UI.
          if (['GET','HEAD'].includes(request.method??'')) sendLocalWebJson(response,409,{code:'space.changed',error:'空间已切换，请刷新页面。'});
          else refuseLocalWebRequest(response);
          return;
        }
        // Dispatch an open Home without yielding, so the core's synchronous
        // request guards run before the HTTP parser continues with the body.
        const entry=surfaces.get(selected.space.spaceId)??await surface(selected),valid=attach(entry,request);
        entry.responses.set(response,valid);
        response.once('close',()=>entry.responses.delete(response));
        if(!valid()){sendLocalWebJson(response,401,{error:'账号已切换。'});return;}
        entry.server.emit('request',request,response);
      }catch(error){
        if(!response.headersSent)sendLocalWebJson(response,403,{code:'space.unavailable',error:'无法访问当前空间，请重新登录或返回本地空间。'});
        else response.destroy();
      }
    });
  });
  server.on('upgrade',(request,socket,head)=>{
    void (async()=>{try{
      if(!requestHost(request)){
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();return;
      }
      const entry=await surface(selection(request));
      const valid=attach(entry,request);
      if(!valid())throw new Error('SPACE_CHANGED');
      entry.connections.set(socket,valid);socket.once('close',()=>entry.connections.delete(socket));
      entry.server.emit('upgrade',request,socket,head);
    }catch{socket.destroy();}})();
  });
  const timer=setInterval(sweep,1000);timer.unref();
  const close=server.close.bind(server);
  server.close=callback=>{
    clearInterval(timer);stop();
    return close(error=>{void Promise.all([...retiring.values()]).then(()=>callback?.(error));});
  };
  // Preserve synchronous configuration validation and start local background owners.
  openSurface({space:local,directory:home,session:null});
  return server;
}
