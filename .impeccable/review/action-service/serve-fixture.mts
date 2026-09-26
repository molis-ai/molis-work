// Isolated real Host and SQLite fixture for browser verification; no user data or remote APIs.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService } from '@molis-ai/molis-work-app-local-host';
import { INBOX_ACTION_PERMISSIONS, inboxActions, inboxNextScene, inboxSceneBindingId } from '@molis-ai/molis-work-plugin-inbox';
import { createMolisWorkWebServer } from '../../../apps/desktop/launchers/web/server.ts';
process.env.MOLIS_WORK_SECRET_BACKEND = 'file';
process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64');
const home = await mkdtemp(join(tmpdir(),'capabilities-browser-'));
const catalog = await openMolisWorkProjectCatalog({homeDirectory:home});
const created = await catalog.createProject({display_name:'能力验收（测试数据）',actor_id:'review'});
const project = catalog.getProject(created.project_id);
const ref = molisWorkHostProjectReference({databasePath:project.database_path,boardId:project.board_id,projectId:project.project_id});
const host = new MolisWorkLocalHost({homeDirectory:home,functions:{env:{TYPESAFE_API_KEY:'isolated-fixture-only'},provider:{async evaluate(_key,record,input){return {primitive:record.primitive,choice:record.primitive==='choice'?record.criteria[0].key:null,noul:record.primitive==='noul'?.8:null,score:record.primitive==='score'?1:null,legend:record.primitive==='score'?[...record.criteria]:null,probabilities:{},confidence:null,model:'jev-1.13.0'};}}}});
const definition={capability_id:'review.inbox.next',version:1,operation:'command' as const,action:{title:'入箱下一步（本地验收规则）',description:'根据入箱材料给出下一步建议；本验收使用固定的本地处理器，无远程模型请求。',kind:'judgment' as const,scope:'home' as const,audiences:['user' as const],permissions:[],subject_kinds:['inbox_entry'],input_schema:inboxNextScene.input_schema,output_schema:{type:'object',properties:{status:{enum:['ok','needs_review']},suggested_behavior_ids:{type:'array',items:{enum:['inbox.verify']}}},required:['status','suggested_behavior_ids']},output_type:inboxNextScene.result_type}};
host.actionRegistry().registerProvider({provider:{provider_id:'review.local',title:'本地验收规则',kind:'plugin'},definitions:[definition],handlers:[{...definition,handle:()=>({status:'ok',suggested_behavior_ids:['inbox.verify']})}]});
const caller={actor_id:'review',project_id:project.project_id,audience:'user' as const,permissions:[...INBOX_ACTION_PERMISSIONS]};
await host.sceneClient(ref).bind(caller,{binding_id:inboxSceneBindingId(project.project_id),scene_id:inboxNextScene.scene_id,scene_version:1,project_id:project.project_id,function:definition,enabled:true,title:'入箱下一步'});
const entry=await host.withProject(ref,runtime=>{const feed=createLocalFeedApplication(runtime.store.db);const source=createLocalFeedSourceService(runtime.store.db,runtime.board_id).register({kind:'research_library',repository:'molis-ai/research-library',research_source:'browser-review'}).source;const item=feed.ingestItem({source,externalId:'review-1',title:'核对发布说明（测试材料）',body:'核对新增能力的可用条件。',summary:'测试材料',occurredAt:new Date().toISOString(),attention:false}).item;return feed.ensureInboxEntryForFeedItem(runtime.board_id,item.item_id,'manual').entry;});
await host.actionClient(ref).invoke(caller,inboxActions.evaluateJudgment,{entry_ids:[entry.entry_id]});
const server=createMolisWorkWebServer({homeDirectory:home,localHost:host,controlToken:'capabilities-browser-fixture-control-token'});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:(server.address() as any).port,project:project.project_id,home})));
async function close(){await new Promise<void>(resolve=>server.close(()=>resolve()));await host.close();catalog.close();await rm(home,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
