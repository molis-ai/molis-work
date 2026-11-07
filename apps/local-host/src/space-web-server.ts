import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { awaitWebServerShutdown } from "./web-server-close.js";
import type { WebAccountSession } from "./personal-web-sessions.js";
import { prepareMemoryHome, preflightMemoryHome } from "./memory/memory-initialization.js";
import { bindPersonalSpaceAuthority } from './personal-space-authority.js';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import type { Duplex } from 'node:stream';
import { acquireStorageOwner, ensureStorageSpace, personalStorageSpace, runWithMolisWorkHome, type StorageSpace } from '@molis-ai/molis-work-storage';
import { createPersonalAccountHttp } from './personal-http.js';
import { createPersonalNativeSession } from './personal-native-session.js';
import { personalCloudConfig } from './personal-auth.js';
import { resolveWebControlToken, sendWebHealth } from './web-control-token.js';
import { authorizeLocalWebRequest, refuseForeignRequest, refuseLocalWebRequest, requestHost, sendLocalWebJson, type LocalMutationState } from './web-http.js';
import type { WebServerOptions } from './web-types.js';
import { ACCOUNT_CONNECT_PATH } from './resident-account-connection.js';
import { MCP_CONTEXT_PATH } from './mcp-context-envelope.js';
import { MANAGEMENT_ACTION_PATH } from './management-action-client.js';
import { ACTION_GATEWAY_PATH, actionGatewayHomeId } from './action-gateway.js';
import { createPersonalSync } from './personal-sync.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import {serveSpaceSync} from './space-sync-http.js';
import { resolveConfiguredHome } from "./product-home.js";
import { closeHostResourceSteps, ensureHomeStorageOwner, retainInitializationCleanup } from './home-storage-lifetime.js';
import { agentRuntimeDirectory } from './agent-runtime-paths.js';
import { trackHostListener } from './host-endpoints.js';

interface Surface {
  home:string; space:StorageSpace; token:string; server:SpaceWebSurface;
  releaseAuthority?:()=>void;
  finishBootstrap?:()=>void;
  users:Map<string,()=>boolean>; connections:Map<Duplex,()=>boolean>; responses:Map<ServerResponse,()=>boolean>;
}

export interface SpaceWebSurface extends http.Server {
  /** Resolves after the runtime and background writers have released their Home. */
  spaceDisposed?:Promise<void>;
  projectSyncLifecycle?:import('./project-deletion-service.js').ProjectDeletionService;
  withSyncCatalog?:LocalWebCatalogRunner;
  readSyncCatalog?:import('./personal-runtime-sync-authority.js').SyncCatalogReader;
  discoverSync?(authorize:()=>void):Promise<readonly import('@molis-ai/molis-work-module-sync-replication').SyncRegistration[]>;
}

/** A delayed surface open must not borrow a newer account's lease for an older selected directory. */
function personalSurfaceLease(space: StorageSpace, session: WebAccountSession | null) {
  if (space.kind !== 'personal') return undefined;
  if (!session || session.space !== 'account') throw new Error('SPACE_CHANGED');
  const lease = session.auth.accountLease();
  lease.assertCurrent();
  if (personalStorageSpace(lease.authOrigin, lease.applicationId, lease.userId).spaceId !== space.spaceId) throw new Error('SPACE_CHANGED');
  return lease;
}

/** The initial writes, including credentials, must pass the same Home ownership and restore gates as the resident Host. */
function bootstrapSpace<T>(directory:string, expected:StorageSpace|undefined, host:WebServerOptions['localHost'], open:(space:StorageSpace)=>T):T {
  if(!host)preflightMemoryHome(directory);
  let owner;
  try { owner=host ? ensureHomeStorageOwner(host,directory,preflightMemoryHome) : acquireStorageOwner(agentRuntimeDirectory(directory)); }
  catch(error){
    if(host && error instanceof ActionError && error.code==='actions.home_mismatch')throw new ActionError('actions.scope_mismatch','不能把个人规划服务绑定到其他 Home',{cause:error});
    throw error;
  }
  try {
    preflightMemoryHome(directory);
    const space=ensureStorageSpace(directory,expected);
    prepareMemoryHome(directory,owner);
    return open(space);
  } finally { if(!host)owner.release(); }
}

function createSpaceContext(options:WebServerOptions,createCore:(options:WebServerOptions)=>SpaceWebSurface,withCatalog:LocalWebCatalogRunner|undefined,address:()=>ReturnType<http.Server["address"]>){
  const home=resolveConfiguredHome(options.homeDirectory);
  const {local,native,rootToken}=bootstrapSpace(home,undefined,options.localHost,local=>({local,native:createPersonalNativeSession(home),rootToken:resolveWebControlToken({...options,homeDirectory:home})}));
  let transition:Promise<void>|undefined, transitionError:string|undefined;
  let activeLease:import('./personal-auth.js').PersonalAccountLease|undefined;
  let activeSpaceId:string|undefined;
  const credentials=new Map<string,{signal:AbortSignal;token:string}>();
  let initializationFailure:import('./home-storage-lifetime.js').HomeInitializationFailure|undefined;
  const account=runWithMolisWorkHome(home,()=>createPersonalAccountHttp(native,{ready:retry=>settleAccount(retry),status:()=>{
    let ready=false;try{activeLease?.assertCurrent();ready=!!activeLease&&!transition&&!transitionError;}catch{ /* Revocation is immediate, before asynchronous cleanup. */ }
    return {ready,switching:!!transition,...(activeSpaceId&&surfaces.get(activeSpaceId)?{viewToken:surfaces.get(activeSpaceId)!.token}:{}),...(transitionError?{error:transitionError}:{})};
  }}));
  const mutations=new Map<string,LocalMutationState>();
  const surfaces=new Map<string,Surface>();
  const retiring=new Map<string,{disposed:Promise<void>;token:string;retry?:()=>void}>();
  let stopping=false;
  const syncs=new Map<string,{active:()=>boolean;service:Awaited<ReturnType<typeof createPersonalSync>>}>();
  const syncStarts=new Map<string,Promise<void>>();
  function isAccountReady(id:string):boolean{
    try{activeLease?.assertCurrent();return !!activeLease&&activeSpaceId===id&&!transition&&!transitionError;}catch{return false;}
  }
  async function releaseRetired():Promise<void>{
    await closeHostResourceSteps(new Set(),[...retiring.entries()].map(([id,entry])=>[id,()=>entry.disposed] as const));
    if(initializationFailure){await initializationFailure.close();initializationFailure=undefined;}
  }
  async function settleAccount(retry=false):Promise<void> {
    if(transition){await transition;return settleAccount(retry);}
    if(transitionError&&!retry)throw new Error(transitionError);
    const session=account.current(),identity=session?.auth.identity();
    const space=identity?personalStorageSpace(personalCloudConfig()!.authOrigin,identity.applicationId,identity.userId):null;
    try{activeLease?.assertCurrent();if(activeLease&&space?.spaceId===activeSpaceId&&!transitionError)return;}catch{ /* Close the revoked owner before selecting a successor. */ }
    const lease=session?.auth.accountLease();
    transition=(async()=>{
      transitionError=undefined;activeLease=undefined;activeSpaceId=undefined;
      for(const entry of syncs.values())entry.service?.close();syncs.clear();
      for(const entry of [...surfaces.values()])retire(entry);
      for(const entry of [...retiring.values()])entry.retry?.();
      await releaseRetired();
      if(stopping)throw new ActionError('actions.unavailable','服务正在关闭。');
      if(!space||!session||!lease)return;
      lease.assertCurrent();
      let entry:Surface;
      try{entry=openSurface({space,directory:path.join(home,'spaces',space.spaceId),session});}
      catch(error){if(error instanceof Error&&'close' in error&&typeof error.close==='function')initializationFailure=error as import('./home-storage-lifetime.js').HomeInitializationFailure;throw error;}
      lease.assertCurrent();entry.users.set('current-account',()=>{try{lease.assertCurrent();return !stopping;}catch{return false;}});
      entry.finishBootstrap?.();activeLease=lease;activeSpaceId=space.spaceId;
    })().catch(error=>{transitionError='账号环境尚未就绪，请重试。';throw error;}).finally(()=>{transition=undefined;});
    return transition;
  }
  const syncFor=async(selected:ReturnType<typeof selection>,request:IncomingMessage)=>{
    if(selected.space.kind!=='personal'||!withCatalog)return null;
    const id=selected.space.spaceId;
    if(syncStarts.has(id))await syncStarts.get(id);
    const old=syncs.get(id);if(old?.active())return old.service;
    old?.service?.close();syncs.delete(id);
    const lease=selected.session!.auth.accountLease();
    const active=()=>{try{lease.assertCurrent();return !stopping&&selection(request).space.spaceId===id;}catch{return false;}};
    const start=(async()=>{
      const entry=await surface(selected);attach(entry,request);const core=entry.server;
      const service=await createPersonalSync(selected.directory,selected.space,lease,core.withSyncCatalog??withCatalog,()=>{if(!active())throw new Error('SYNC_ACCOUNT_CHANGED');},core.discoverSync,core.projectSyncLifecycle,core.readSyncCatalog);
      if(!active()){service?.close();return;}
      syncs.set(id,{active,service});
      lease.signal.addEventListener('abort',()=>service?.close(),{once:true});
    })();
    syncStarts.set(id,start);try{await start;}finally{syncStarts.delete(id);}
    return syncs.get(id)?.service??null;
  };

  const selection=(request:IncomingMessage)=>{
    const session=account.context(request);
    const identity=session?.auth.identity();
    const space=identity
      ? personalStorageSpace(personalCloudConfig()!.authOrigin,identity.applicationId,identity.userId):local;
    const directory=space.kind==='local'?home:path.join(home,'spaces',space.spaceId);
    if(space.kind==='personal' && (options.localHost||options.databasePath))throw new Error('SPACE_FIXTURE_NOT_SUPPORTED');
    return {space,directory,session};
  };
  const surface=async(selected:ReturnType<typeof selection>):Promise<Surface>=>{
    if(selected.space.kind==='local')throw new ActionError('actions.forbidden','请先登录当前账号。');
    await settleAccount();
    if(activeSpaceId!==selected.space.spaceId)throw new Error('SPACE_CHANGED');
    personalSurfaceLease(selected.space,selected.session);
    return openSurface(selected);
  };
  const tokenFor=(selected:ReturnType<typeof selection>)=>{
    const {directory,space}=selected;
    if(space.kind==='local')return rootToken;
    const lease=personalSurfaceLease(space,selected.session)!;
    // Account management remains available while its old business surface releases the Home.
    const known=surfaces.get(space.spaceId)??retiring.get(space.spaceId);
    if(known)return known.token;
    const issued=credentials.get(space.spaceId);if(issued?.signal===lease.signal)return issued.token;
    const spaces=path.join(home,'spaces');fs.mkdirSync(spaces,{recursive:true,mode:0o700});
    if(fs.realpathSync(spaces)!==path.join(fs.realpathSync(home),'spaces'))throw new Error('SPACE_DIRECTORY_UNSAFE');
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    if(fs.realpathSync(directory)!==path.join(fs.realpathSync(spaces),space.spaceId))throw new Error('SPACE_DIRECTORY_UNSAFE');
    const token=bootstrapSpace(directory,space,undefined,()=>resolveWebControlToken({homeDirectory:directory,renew:true}));
    credentials.set(space.spaceId,{signal:lease.signal,token});return token;
  };
  const openSurface=(selected:ReturnType<typeof selection>):Surface=>{
    if(stopping)throw new Error('SPACE_CLOSED');
    let result=surfaces.get(selected.space.spaceId);
    if(result)return result;
    const {directory,space}=selected;
    const initialLease=personalSurfaceLease(space,selected.session);
    const coreOptions=space.kind==='local'?{...options,homeDirectory:directory}:{homeDirectory:directory};
    const token=tokenFor(selected);
    const core=runWithMolisWorkHome(directory,()=>createCore({...coreOptions,controlToken:token,accountRegistration:true}));
    core.address=address;
    result={home:directory,space,token,server:core,users:new Map(),connections:new Map(),responses:new Map()};
    if(space.kind==='personal'){
      const current=result;
      let bootstrapping=true;current.finishBootstrap=()=>{bootstrapping=false;};
      current.releaseAuthority=bindPersonalSpaceAuthority(directory,space.spaceId,()=>{
        if(stopping||surfaces.get(space.spaceId)!==current)throw new Error('REPLICA_ACCOUNT_MISMATCH');
        if([...current.users.values()].some(valid=>valid()))return;
        if(bootstrapping&&selected.session!.space==='account'){initialLease!.assertCurrent();return;}
        throw new Error('REPLICA_ACCOUNT_MISMATCH');
      });
    }
    surfaces.set(space.spaceId,result);
    return result;
  };
  const disconnect=(entry:Surface)=>{
    for(const response of entry.responses.keys())response.destroy();
    for(const socket of entry.connections.keys())socket.destroy();
  };
  const retire=(entry:Surface)=>{
    entry.releaseAuthority?.();
    surfaces.delete(entry.space.spaceId);
    disconnect(entry);
    const disposed=closeSpaceSurface(entry.server);
    const retirement:{disposed:Promise<void>;token:string;retry?:()=>void}={disposed,token:entry.token};
    retiring.set(entry.space.spaceId,retirement);
    void disposed.then(()=>{if(retiring.get(entry.space.spaceId)===retirement)retiring.delete(entry.space.spaceId);},()=>{retirement.retry=()=>retire(entry);});
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
    entry.finishBootstrap?.();
    return valid;
  };
  const stop=()=>{
    stopping=true;account.close();
    for(const entry of syncs.values())entry.service?.close();
    for(const entry of [...retiring.values()])entry.retry?.();
    for(const entry of [...surfaces.values()]){
      if(entry.space.kind==='personal')retire(entry);
      else {
        // Let in-flight actions deliver the Host's cancellation result; only streams need forced closure.
        for(const response of entry.responses.keys())if(response.headersSent&&!response.writableEnded)response.destroy();
        for(const socket of entry.connections.keys())socket.destroy();
      }
    }
  };
  const resume=async(request:IncomingMessage)=>{
    try{(await syncFor(selection(request),request))?.start();}
    catch{ /* Sync settings report the failure; unavailable sync must not prevent local work. */ }
  };
  return {home,native,account,rootToken,tokenFor,mutations,surface,selection,attach,sweep,syncFor,resume,surfaces,stop,settleAccount,releaseRetired,isAccountReady,isStopping:()=>stopping};
}

async function closeSpaceSurface(core: SpaceWebSurface):Promise<void> {
  await new Promise<void>((resolve,reject)=>core.close(error=>{
    if(error && (error as NodeJS.ErrnoException).code!=='ERR_SERVER_NOT_RUNNING')reject(error);else resolve();
  }));
  await core.spaceDisposed;
}

/** One public listener. Each scope owns its Host, databases, caches and timers.
 * Child servers are in-process dispatchers: no extra port and no browser-selected Home.
 */
export function createSpaceWebServer(options:WebServerOptions,createCore:(options:WebServerOptions)=>SpaceWebSurface,withCatalog?:LocalWebCatalogRunner,accountEntry?:{
  render(token:string,request:IncomingMessage,url:URL,message?:string):string;
  asset(request:IncomingMessage,response:ServerResponse,url:URL):boolean;
}):http.Server {
  let server:http.Server;
  const {home,native,account,rootToken,tokenFor,mutations,surface,selection,attach,sweep,syncFor,resume,surfaces,stop,settleAccount,releaseRetired,isAccountReady,isStopping}=createSpaceContext(options,createCore,withCatalog,()=>server?.address()??null);
  let timer:ReturnType<typeof setInterval>|undefined, shutdown:(()=>Promise<void>)|undefined;
  try {
    server=trackHostListener(http.createServer((request,response)=>{
    void runWithMolisWorkHome(home,async()=>{
      try {
        if(isStopping()){sendLocalWebJson(response,503,{error:'服务正在关闭。'});return;}
        const url=new URL(request.url??'/','http://localhost');
        if(refuseForeignRequest(request,response))return;
        // CLI/MCP have no browser cookies. Only an already-open, authenticated
        // personal Host can be reached with its exact Home id and private token.
        const gatewayHome=request.headers['x-molis-work-home-id'];
        const internal=[ACTION_GATEWAY_PATH,MCP_CONTEXT_PATH,MANAGEMENT_ACTION_PATH,'/api/settings/demo'].includes(url.pathname);
        if(url.pathname==='/health'){
          const entry=[...surfaces.values()].find(item=>actionGatewayHomeId(item.home)===gatewayHome&&isAccountReady(item.space.spaceId));
          const scoped=gatewayHome&&gatewayHome!==actionGatewayHomeId(home);
          sendWebHealth(response,scoped&&!entry?503:200,{status:scoped&&!entry?'starting':'ok',process_id:process.pid,desktop_tui:true,account_required:!entry},entry?.token??rootToken,url.searchParams.get('challenge'));return;
        }
        if(url.pathname===ACCOUNT_CONNECT_PATH){
          if(!native(request)){refuseLocalWebRequest(response);return;}
          if(!authorizeLocalWebRequest(request,response,url,rootToken,mutations))return;
          if(request.method!=='POST'){sendLocalWebJson(response,405,{error:'不支持此操作。'});return;}
          if(account.preparing()){sendLocalWebJson(response,409,{error:'账号操作进行中，请稍后显式重连。'});return;}
          await settleAccount();const session=account.current();
          if(!session){sendLocalWebJson(response,401,{error:'请先登录当前安装的账号。'});return;}
          const selected=selection(request),entry=surfaces.get(selected.space.spaceId);
          if(!entry||!isAccountReady(entry.space.spaceId)){sendLocalWebJson(response,503,{error:'当前账号尚未就绪。'});return;}
          sendLocalWebJson(response,200,{homeDirectory:entry.home,controlToken:entry.token});return;
        }
        if(internal&&account.preparing()){sendLocalWebJson(response,409,{error:'正在处理旧页面的未保存内容，请稍候。'});return;}
        if(internal && gatewayHome && gatewayHome!==actionGatewayHomeId(home)){
          const entry=[...surfaces.values()].find(item=>actionGatewayHomeId(item.home)===gatewayHome);
          const active=()=>!!entry && [...entry.users.values()].some(valid=>valid());
          if(entry && active() && request.headers['x-molis-work-control-token']===entry.token){
            entry.responses.set(response,active);response.once('close',()=>entry.responses.delete(response));
            entry.server.emit('request',request,response);return;
          }
          // A valid root credential may reach its own gate, which reports the Home mismatch.
          // An unknown/retired space credential still gets only the opaque control refusal.
          refuseLocalWebRequest(response);return;
        }
        const selected=selection(request);
        let token=selected.space.kind==='local'?rootToken:tokenFor(selected);
        const accountPath=url.pathname.startsWith('/api/personal/')||['/account','/account/callback','/welcome'].includes(url.pathname);
        const address=server.address();
        const origin=`http://127.0.0.1:${address&&typeof address==='object'?address.port:4173}`;
        if(accountEntry?.asset(request,response,url))return;
        if(url.pathname.startsWith('/api/sync')){
          const expectedSpace=request.headers['x-molis-sync-space'];
          if(expectedSpace&&expectedSpace!==selected.space.spaceId){sendLocalWebJson(response,409,{error:'空间已切换，请刷新页面。'});return;}
          if(request.headers['x-molis-work-control-token']!==token){sendLocalWebJson(response,403,{error:'空间已切换，请刷新页面。'});return;}
          if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
          await serveSpaceSync({request,response,url,local:selected.space.kind==='local',service:()=>syncFor(selected,request)});
          return;
        }
        if(accountPath){
          if(!authorizeLocalWebRequest(request,response,url,native(request)||request.headers['x-molis-work-control-token']===rootToken?rootToken:token,mutations))return;
          if(!await account(request,response,url,origin,token,''))sendLocalWebJson(response,404,{error:'接口不存在。'});
          sweep();await resume(request);return;
        }
        if(selected.space.kind==='local'){
          if(request.method==='GET'&&!url.pathname.startsWith('/api/')&&accountEntry){response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'});response.end(accountEntry.render(rootToken,request,url));}
          else sendLocalWebJson(response,401,{error:'请先登录当前安装的账号。'});
          return;
        }
        if(account.preparing()){sendLocalWebJson(response,409,{error:'正在处理旧页面的未保存内容，请稍候。'});return;}
        if(!isAccountReady(selected.space.spaceId))await settleAccount();
        token=tokenFor(selected);
        if(url.pathname==='/api/spaces'){
          if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
          if(request.method!=='GET'){sendLocalWebJson(response,405,{error:'不支持此操作。'});return;}
          const identity=selected.session?.auth.identity();
          const personal=identity?personalStorageSpace(personalCloudConfig()!.authOrigin,identity.applicationId,identity.userId):null;
          sendLocalWebJson(response,200,{current:selected.space,spaces:personal?[personal]:[],syncEnabled:false});return;
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
        // Do not yield before the core's synchronous HTTP guards (including malformed mutation bodies).
        void resume(request);
      }catch(error){
        if(!response.headersSent){
          if(request.method==='GET'&&!(request.url??'/').startsWith('/api/')&&accountEntry){response.writeHead(503,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'});response.end(accountEntry.render(rootToken,request,new URL(request.url??'/','http://localhost'),'账号环境尚未就绪，请重试。'));}
          else sendLocalWebJson(response,503,{code:'space.unavailable',error:'账号环境尚未就绪，请重试。'});
        }
        else response.destroy();
      }
    });
  }));
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
  timer=setInterval(sweep,1000);timer.unref();
  shutdown=awaitWebServerShutdown(server,()=>{clearInterval(timer);stop();},
    releaseRetired);
  return server;
  } catch(error){
    throw retainInitializationCleanup(error,async()=>{
      clearInterval(timer);stop();
      if(shutdown)await shutdown();else if(server)await closeSpaceSurface(server);

    },'web_initialization_cleanup_failed');
  }
}
