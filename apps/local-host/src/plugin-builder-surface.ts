import type {IncomingMessage,ServerResponse} from 'node:http';
import {createPrologueTypeSafeProvider} from './typesafe-prologue.js';
import {FUNCTIONS_DEFAULT_MODEL,type FunctionRecord} from '@molis-ai/molis-work-contracts/modules/functions';
import {typeSafeCredential,typeSafeConfiguration} from './typesafe-connection.js';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import {UiHost} from '@molis-ai/molis-work-ui-host';
import {ArtifactsModule} from '@molis-ai/molis-work-module-artifacts';
import {escapeHtml,renderIconSprite} from '@molis-ai/molis-work-design-system';
import {createBuilderPlugin,createGeneratedPlugin,compatibleReleaseVersions,migratableReleaseVersions,BUILDER_PLUGIN_ID,BUILDER_STYLES,BUILDER_CLIENT_FACTORY_SCRIPT,RECORD_CLIENT_FACTORY_SCRIPT,renderBuilder,type BuilderWorkflow,type ChoiceQuestion,type Release,type GeneratedPluginControl} from '@molis-ai/molis-work-plugin-builder';
import {createPluginPlatform,type PluginPlatform} from './plugin-platform.js';
import {nativePluginReleaseArtifact} from './native-plugin-release-artifact.js';
import type {CodingSurfacePorts as HostSurfacePorts} from './coding-surface.js';
/** `choice` replaces Jev only where a caller says so, e.g. a labelled local preview. */
type CodingSurfacePorts=HostSurfacePorts&{choice?:{choose(question:ChoiceQuestion):Promise<{choice:string|null;model:string;elapsedMs:number;confidence:number|null}>;selectionAvailable():boolean}};
import type {LocalProjectDatabase} from './project-database.js';
import {readLocalWebBody,sendLocalWebJson} from './web-http.js';
interface GeneratedSurface {platform:PluginPlatform;control:GeneratedPluginControl;release:Release}
interface BuilderSurface {platform:PluginPlatform;workflow:BuilderWorkflow;generated:Map<string,Promise<GeneratedSurface>>}
const surfaces=new WeakMap<LocalProjectDatabase,Map<string,Promise<BuilderSurface>>>();
export function selectionPorts(homeDirectory?:string){
 const key=()=>process.env.TYPESAFE_API_KEY?.trim()||(homeDirectory?typeSafeCredential(homeDirectory,'functions'):null);
 return {selectionAvailable:()=>Boolean(key()),async choose(question:ChoiceQuestion){
  const credential=key();if(!credential)throw new Error('请在 Functions 设置中配置 TypeSafe Key');
  const provider=createPrologueTypeSafeProvider(homeDirectory,{resolveCredential:key,configuration:()=>process.env.TYPESAFE_API_KEY?.trim()?'env':homeDirectory?typeSafeConfiguration(homeDirectory,'functions'):null});const started=performance.now(),now=new Date().toISOString();
  // A transient choice question: never listed, published or stored as a user function.
  const record:FunctionRecord={id:question.key,name:'插件创作零件选择',status:'draft',version:null,instructions:question.instructions,scene_id:null,subject_kinds:[],scene_map:{},config_hash:'',last_preview:null,samples:[],published_at:null,created_at:now,updated_at:now,function_key:question.key,primitive:'choice',model:FUNCTIONS_DEFAULT_MODEL,criteria:question.candidates.map(c=>({key:c.key,description:c.description}))};
  const result=await provider.evaluate(credential,record,question.state);
  return {choice:result.choice,model:result.model,elapsedMs:Math.round(performance.now()-started),confidence:result.confidence};
 }};
}
function platformFor(ports:CodingSurfacePorts){const storage=new SqlitePluginPrivateStorage(ports.store.db);return createPluginPlatform({board_id:ports.boardId,actor_id:ports.actorId,db:ports.store.db,artifacts:new ArtifactsModule({db:ports.store.db,appendEvent:event=>ports.store.appendEvent(event)}),ui:new UiHost(),privateStorageFor:(context,manifest)=>storage.forPlugin(context,manifest),capturePrivateData:installId=>storage.snapshotInstallationData(installId),restorePrivateData:(installId,snapshot)=>storage.restoreInstallationData(installId,snapshot as ReturnType<typeof storage.snapshotInstallationData>),capabilities:ports.capabilities,actions:ports.actions});}
async function ensureBuilder(ports:CodingSurfacePorts):Promise<BuilderSurface>{
 let boards=surfaces.get(ports.store);if(!boards){boards=new Map();surfaces.set(ports.store,boards);}let promise=boards.get(ports.boardId);if(promise)return promise;
 let surface!:BuilderSurface;
 promise=(async()=>{if(!ports.execution)throw new Error('Prologue 创作执行入口尚未装配');const platform=platformFor(ports);let workflow:BuilderWorkflow|undefined;
  const builderPorts={...ports.execution,...(ports.choice??selectionPorts(ports.homeDirectory)),
   async installedVersions(){const installed:Record<string,string>={};for(const release of surface.workflow.store.releases()){
    const record=surface.platform.runtime.list().find(item=>item.plugin_id===release.pluginId&&item.publisher_signature===`generated-builder-${release.buildId}`&&item.state!=='uninstalled');
    if(record)installed[release.pluginId]=record.version;
   }return installed;},
   async upgradePublished(release:Release){await upgradeGenerated(surface,release,ports);}};
  const createBuilderDefinition=()=>createBuilderPlugin(builderPorts,value=>{workflow=value;});
  const report=await platform.start([{
   definition:createBuilderDefinition(),
   releaseArtifact:nativePluginReleaseArtifact<typeof createBuilderPlugin>(
    '@molis-ai/molis-work-plugin-builder','createBuilderPlugin',factory=>factory(builderPorts,value=>{workflow=value;})),
  }]);
  if(!workflow||!report.running.includes(BUILDER_PLUGIN_ID))throw new Error(report.failed[0]?.message||report.blocked[0]?.message||'创作插件未能启动');
  surface={platform,workflow,generated:new Map()};return surface;})();boards.set(ports.boardId,promise);try{return await promise;}catch(error){boards.delete(ports.boardId);throw error;}
}
async function ensureGenerated(surface:BuilderSurface,release:Release,ports:CodingSurfacePorts){
 let running=surface.generated.get(release.pluginId);if(running)return running;
 running=(async()=>{const platform=platformFor(ports);const versions=surface.workflow.store.versions(release.buildId);
  const installed=surface.platform.runtime.list().find(item=>item.plugin_id===release.pluginId&&item.publisher_signature===`generated-builder-${release.buildId}`&&item.state!=='uninstalled');
  const installedVersion=installed?.version.match(/^(\d+)\.0\.0$/)?.[1];
  const original=installedVersion?versions.find(item=>item.version===Number(installedVersion)):release;
  if(!original)throw new Error(`找不到已安装版本 ${installed?.version} 对应的创作台发布记录`);
  let control:GeneratedPluginControl|undefined;
  const definition=createGeneratedPlugin(original,()=>original,value=>{control=value;},compatibleReleaseVersions(versions,original.version),migratableReleaseVersions(versions,original.version));
  const report=await platform.start([{definition}]);
  if(!report.running.includes(release.pluginId)||!control)throw new Error(report.failed[0]?.message||'生成插件启动失败');return {platform,control,release:original};})();surface.generated.set(release.pluginId,running);try{return await running;}catch(error){surface.generated.delete(release.pluginId);throw error;}
}
async function upgradeGenerated(surface:BuilderSurface,release:Release,ports:CodingSurfacePorts){
 const active=await (surface.generated.get(release.pluginId)??ensureGenerated(surface,release,ports));
 if(active.release.version>=release.version)throw new Error(`当前已安装 v${active.release.version}，不能切换到 v${release.version}`);
 const versions=surface.workflow.store.versions(release.buildId);let control:GeneratedPluginControl|undefined;
 const definition=createGeneratedPlugin(release,()=>release,value=>{control=value;},compatibleReleaseVersions(versions,release.version),migratableReleaseVersions(versions,release.version));
 const state=await active.platform.upgrade(release.pluginId,definition);
 if(state?.status!=='running'||!control)throw new Error(state?.message||'生成插件升级失败');
 surface.generated.set(release.pluginId,Promise.resolve({platform:active.platform,control,release}));
}
const literal=(value:unknown)=>JSON.stringify(value).replaceAll('<','\\u003c');
function documentHtml(title:string,body:string,script:string,controlToken:string){return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(title)+'</title><style>html,body{margin:0;height:100%;background:#f3f3f1;color:#242832}body>section{height:100%}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}'+BUILDER_STYLES+'</style></head><body>'+renderIconSprite()+body+'<script>globalThis.molisWorkControlHeaders=()=>({"content-type":"application/json","x-molis-work-control-token":'+literal(controlToken)+',"x-molis-work-idempotency-key":crypto.randomUUID()});'+script+'</script></body></html>';}
/** All mutations reach this dispatcher after the shared local HTTP control guard. */
export async function handleBuilderHttp(request:IncomingMessage,response:ServerResponse,url:URL,ports:CodingSurfacePorts,controlToken:string):Promise<boolean>{
 const builderApi=url.pathname.startsWith('/api/plugins/'+BUILDER_PLUGIN_ID+'/');
 const generatedApi=/^\/api\/plugins\/io\.molis\.work\.generated\.[a-zA-Z0-9-]+\//.test(url.pathname);
 const generatedPage=/^\/plugins\/io\.molis\.work\.generated\.[a-zA-Z0-9-]+$/.test(url.pathname);
 const builderPage=url.pathname==='/plugin-builder';
 if(!builderApi&&!generatedApi&&!generatedPage&&!builderPage)return false;
 try{
  const surface=await ensureBuilder(ports);const prefix=ports.routePrefix??'';
  if(builderPage&&request.method==='GET'){
   const body=renderBuilder().replace(' hidden>','>');
   response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});response.end(documentHtml('插件创作工作台',body,'('+BUILDER_CLIENT_FACTORY_SCRIPT+')({route:p=>'+literal(prefix)+'+p});',controlToken));return true;
  }
  let platform=surface.platform;
  if(generatedApi||generatedPage){
   const id=url.pathname.split('/')[generatedPage?2:3]!;const candidate=surface.workflow.store.releases().find(r=>r.pluginId===id);
   if(!candidate){sendLocalWebJson(response,404,{error:'当前项目没有这个已发布插件'});return true;}
   const generated=await ensureGenerated(surface,candidate,ports);const release=generated.release;platform=generated.platform;
   if(generatedPage&&request.method==='GET'){
    const view=platform.supervisor.contribution(id);const contribution=view?.kind==='app'?view.views?.[0]:null;
    if(!contribution)throw new Error('插件界面尚未启动');
    const body='<header class="pb-standalone-bar"><a href="'+escapeHtml(prefix+'/plugin-builder?build='+release.buildId)+'">编辑新草稿</a><span>'+escapeHtml(release.design.title)+' · v'+release.version+' · 数据保存在本机</span></header>'+contribution.render({contribution_id:contribution.descriptor.contribution_id,surface:'app',model:{}});
    const script='(async()=>{const base='+literal(prefix+'/api/plugins/'+id)+';let release;const request=async(method,body,query)=>{const u=new URL(base+"/records",location.origin);if(query)Object.entries(query).forEach(([k,v])=>{if(v)u.searchParams.set(k,v)});const response=await fetch(u,{method,headers:method==="GET"?{}:globalThis.molisWorkControlHeaders(),...(method==="GET"?{}:{body:JSON.stringify({...body,releaseVersion:release.version})})});const result=await response.json();if(!response.ok)throw new Error(result.error||"操作失败");return result;};const root=document.querySelector("[data-generated-app]");root.style.setProperty("--pb-atlas",'+literal('url("'+prefix+'/api/plugins/'+BUILDER_PLUGIN_ID+'/assets/inspiration-atlas.png")')+');try{const response=await fetch(base+"/state");const result=await response.json();if(!response.ok)throw new Error(result.error);release=result.release;const app=('+RECORD_CLIENT_FACTORY_SCRIPT+')({root,request});app.update(release.design,release.nodes,release.behavior);}catch(error){root.textContent=error.message;}})();';
    response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});response.end(documentHtml(release.design.title,body,script,controlToken));return true;
   }
  }
  const result=await platform.router().dispatch({method:request.method??'GET',pathname:url.pathname,actor_id:ports.actorId,query:Object.fromEntries(url.searchParams),...(['GET','HEAD'].includes(request.method??'GET')?{}:{body:await readLocalWebBody(request)})});
  if(!result){sendLocalWebJson(response,404,{error:'未声明的插件操作'});return true;}
  if(result.bytes){response.writeHead(result.status,{"content-type":result.mime??"application/octet-stream","cache-control":"private, max-age=86400",...result.headers});response.end(result.bytes);}else sendLocalWebJson(response,result.status,result.body);return true;
 }catch(error){sendLocalWebJson(response,400,{error:error instanceof Error?error.message:'插件暂时无法打开'});return true;}
}
export async function releaseBuilderSurface(store:LocalProjectDatabase,boardId:string){const boards=surfaces.get(store),pending=boards?.get(boardId);if(!pending)return;boards!.delete(boardId);const surface=await pending.catch(()=>null);if(!surface)return;for(const platform of [surface.platform,...(await Promise.all([...surface.generated.values()])).map(value=>value.platform)]){for(const id of platform.supervisor.enabledPluginIds()){const state=platform.supervisor.state(id);platform.supervisor.revoke(id);if(state?.status==='running'&&state.install_id)await platform.runtime.stop(state.install_id);}}}

/**
 * The studio asks the workbench to open a plugin it installed, through the same rail entry a person would click.
 * A plugin installed since the page loaded has no entry yet, so the page reloads once and then opens it; an
 * uninstalled plugin's entry and stage leave the page at once.
 */
const STUDIO_STAGE_SCRIPT=`(()=>{const KEY="molis-studio-open";const valid=s=>typeof s==="string"&&/^app-[a-f0-9-]{36}$/.test(s);
const entry=s=>[...document.querySelectorAll("[data-work-surface-open]")].find(el=>el.dataset.workSurfaceOpen===s);
addEventListener("message",event=>{const frame=document.querySelector(".pb-studio-frame");if(event.origin!==location.origin||!frame||event.source!==frame.contentWindow||!valid(event.data?.surface))return;
 if(event.data.type==="molis-studio-open-plugin"){const button=entry(event.data.surface);if(button)button.click();else{try{sessionStorage.setItem(KEY,event.data.surface)}catch{}location.reload()}}
 if(event.data.type==="molis-studio-plugin-removed"){entry(event.data.surface)?.remove();[...document.querySelectorAll("[data-work-surface]")].find(el=>el.dataset.workSurface===event.data.surface)?.remove()}});
let pending=null;try{pending=sessionStorage.getItem(KEY);sessionStorage.removeItem(KEY)}catch{}
if(valid(pending))addEventListener("load",()=>setTimeout(()=>entry(pending)?.click(),0),{once:true});})();`;

/**
 * The workbench entry opens the agent-built plugin studio. It is a host page (no plugin script runs in it), framed
 * in place and loaded only when the entry is opened; the earlier interpreter-based builder is no longer the entry.
 */
export async function builderWorkbenchPanel(ports:CodingSurfacePorts):Promise<string>{
 const source=(ports.routePrefix??'')+'/plugin-builder/studio';
 return '<section class="desktop-work-surface pb-surface" data-work-surface="plugin-builder" data-work-surface-label="插件创作工作台" hidden>'
  +'<iframe class="pb-studio-frame" src="'+escapeHtml(source)+'" title="插件创作工作台" loading="lazy" style="display:block;width:100%;height:100%;min-height:calc(100vh - 64px);border:0;background:#f3f3f1"></iframe>'
  +'<script>'+STUDIO_STAGE_SCRIPT+'</script></section>';
}

