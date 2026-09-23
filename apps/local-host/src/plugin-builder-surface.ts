import type {IncomingMessage,ServerResponse} from 'node:http';
import {createLazyFileSecretStore} from '@molis-ai/molis-work-storage';
import {createHttpTypeSafeProvider} from '@molis-ai/molis-work-module-functions';
import {FUNCTIONS_CREDENTIAL_REF,FUNCTIONS_DEFAULT_MODEL,type FunctionRecord} from '@molis-ai/molis-work-contracts/modules/functions';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import {UiHost} from '@molis-ai/molis-work-ui-host';
import {ArtifactsModule} from '@molis-ai/molis-work-module-artifacts';
import {escapeHtml,renderIconSprite} from '@molis-ai/molis-work-design-system';
import {createBuilderPlugin,createGeneratedPlugin,BUILDER_PLUGIN_ID,BUILDER_STYLES,BUILDER_CLIENT_FACTORY_SCRIPT,RECORD_CLIENT_FACTORY_SCRIPT,renderBuilder,type BuilderWorkflow,type Design,type Release,type GeneratedPluginControl} from '@molis-ai/molis-work-plugin-builder';
import {createPluginPlatform,type PluginPlatform} from './plugin-platform.js';
import type {CodingSurfacePorts} from './coding-surface.js';
import type {LocalProjectDatabase} from './project-database.js';
import {readLocalWebBody,sendLocalWebJson} from './web-http.js';
interface GeneratedSurface {platform:PluginPlatform;control:GeneratedPluginControl}
interface BuilderSurface {platform:PluginPlatform;workflow:BuilderWorkflow;generated:Map<string,Promise<GeneratedSurface>>}
const surfaces=new WeakMap<LocalProjectDatabase,Map<string,Promise<BuilderSurface>>>();
function selectionPorts(homeDirectory?:string){
 const secrets=()=>createLazyFileSecretStore(homeDirectory);
 const key=()=>secrets().get(FUNCTIONS_CREDENTIAL_REF)?.trim()||process.env.TYPESAFE_API_KEY?.trim();
 return {selectionAvailable:()=>Boolean(key()),async selectLayout(design:Design){
  const credential=key();if(!credential)throw new Error('请在 Functions 设置中配置 TypeSafe Key，或采用所选方案继续');
  const provider=createHttpTypeSafeProvider();const started=performance.now();
  const record:FunctionRecord={id:'plugin-builder-layout',name:'集合零件',status:'draft',version:null,instructions:'根据主线旅程选择适合操作的集合零件。不要改变字段、数据或任务范围。',scene_id:null,subject_kinds:[],scene_map:{},config_hash:'',last_preview:null,samples:[],published_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),function_key:'plugin_builder_layout',primitive:'choice',model:FUNCTIONS_DEFAULT_MODEL,criteria:[{key:'cards',description:'卡片：每项独立浏览，适合素材与灵感'},{key:'list',description:'列表：快速逐项阅读和编辑'},{key:'table',description:'表格：密集比较字段和数值统计'}]};
  const result=await provider.evaluate(credential,record,JSON.stringify(design));
  if(!['cards','list','table'].includes(result.choice??''))throw new Error('Jev 没有选择合法零件，草稿未改变；可重试或手动选择');
  return {layout:result.choice as Design['layout'],model:result.model,elapsedMs:Math.round(performance.now()-started)};
 }};
}
function platformFor(ports:CodingSurfacePorts){const storage=new SqlitePluginPrivateStorage(ports.store.db);return createPluginPlatform({board_id:ports.boardId,actor_id:ports.actorId,db:ports.store.db,artifacts:new ArtifactsModule({db:ports.store.db,appendEvent:event=>ports.store.appendEvent(event)}),ui:new UiHost(),privateStorageFor:(context,manifest)=>storage.forPlugin(context,manifest),capabilities:ports.capabilities});}
async function ensureBuilder(ports:CodingSurfacePorts):Promise<BuilderSurface>{
 let boards=surfaces.get(ports.store);if(!boards){boards=new Map();surfaces.set(ports.store,boards);}let promise=boards.get(ports.boardId);if(promise)return promise;
 promise=(async()=>{if(!ports.execution)throw new Error('Prologue 创作执行入口尚未装配');const platform=platformFor(ports);let workflow:BuilderWorkflow|undefined;
  const report=await platform.start([{definition:createBuilderPlugin({...ports.execution,...selectionPorts(ports.homeDirectory),async publicationValidator(id){
   const surface=await ensureBuilder(ports);const release=surface.workflow.store.releases().find(r=>r.buildId===id);if(!release)throw new Error('找不到当前发布版本');
   const generated=await ensureGenerated(surface,release,ports);return (design,behavior)=>generated.control.validateRecords(design,behavior);
  }},value=>{workflow=value;}),replace_version:true}]);
  if(!workflow||!report.running.includes(BUILDER_PLUGIN_ID))throw new Error(report.failed[0]?.message||report.blocked[0]?.message||'创作插件未能启动');
  return {platform,workflow,generated:new Map()};})();boards.set(ports.boardId,promise);try{return await promise;}catch(error){boards.delete(ports.boardId);throw error;}
}
async function ensureGenerated(surface:BuilderSurface,release:Release,ports:CodingSurfacePorts){
 let running=surface.generated.get(release.pluginId);if(running)return running;
 running=(async()=>{const platform=platformFor(ports);const original=surface.workflow.store.versions(release.buildId).at(-1)!;let control:GeneratedPluginControl|undefined;
  const report=await platform.start([{definition:createGeneratedPlugin(original,()=>{const current=surface.workflow.store.releases().find(r=>r.pluginId===release.pluginId);if(!current)throw new Error('已发布插件不存在');return current;},value=>{control=value;}),replace_version:true}]);
  if(!report.running.includes(release.pluginId)||!control)throw new Error(report.failed[0]?.message||'生成插件启动失败');return {platform,control};})();surface.generated.set(release.pluginId,running);try{return await running;}catch(error){surface.generated.delete(release.pluginId);throw error;}
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
   const id=url.pathname.split('/')[generatedPage?2:3]!;const release=surface.workflow.store.releases().find(r=>r.pluginId===id);
   if(!release){sendLocalWebJson(response,404,{error:'当前项目没有这个已发布插件'});return true;}
   platform=(await ensureGenerated(surface,release,ports)).platform;
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

export async function builderWorkbenchPanel(ports:CodingSurfacePorts):Promise<string>{
 try{const surface=await ensureBuilder(ports);const view=surface.platform.supervisor.contribution(BUILDER_PLUGIN_ID);const ui=view?.kind==='app'?view.views?.[0]:null;if(!ui)throw new Error('创作插件未启动');return ui.render({contribution_id:ui.descriptor.contribution_id,surface:'workbench',model:{}});}
 catch(error){return '<section class="desktop-work-surface" data-work-surface="plugin-builder" data-work-surface-label="插件创作工作台" hidden><p role="alert">'+escapeHtml(error instanceof Error?error.message:'创作插件未启动')+'</p></section>';}
}
