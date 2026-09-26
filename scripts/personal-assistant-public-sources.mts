/** Read-only use of an existing built Host; all Feed/project writes stay in disposable test storage. */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
if(process.env.MOLIS_ASSISTANT_PUBLIC_SOURCES!=='1')throw new Error('Set MOLIS_ASSISTANT_PUBLIC_SOURCES=1 for public RSS verification.');
const root=resolve(process.env.MOLIS_BUILT_HOST_ROOT??'.');
const moduleAt=(relative:string)=>import(pathToFileURL(join(root,relative)).href);
const home=await mkdtemp(join(tmpdir(),'assistant-public-feed-'));
const oldHome=process.env.MOLIS_WORK_HOME,oldBackend=process.env.MOLIS_WORK_SECRET_BACKEND;
process.env.MOLIS_WORK_HOME=home;process.env.MOLIS_WORK_SECRET_BACKEND='file';
let db:any;
try{
 const {seedDemoBoard,DEMO_BOARD_ID}=await moduleAt('apps/local-host/dist/demo-seed.js');
 const {LocalProjectDatabase}=await moduleAt('apps/local-host/dist/project-database.js');
 const {createLocalFeedSourceService}=await moduleAt('apps/local-host/dist/feed-source-service.js');
 const {hydrateFeedItemContent}=await moduleAt('apps/local-host/dist/feed-content.js');
 const {createFeedContentHandlers,feedSubjectAction}=await moduleAt('plugins/native/feed/dist/content-actions.js');
 const database=join(home,'project.db');seedDemoBoard(database);db=new LocalProjectDatabase(database);
 const service=createLocalFeedSourceService(db.db,DEMO_BOARD_ID,undefined,undefined,home);
 const sources=[{name:'Node.js releases',feed_url:'https://github.com/nodejs/node/releases.atom'},{name:'TypeScript releases',feed_url:'https://github.com/microsoft/TypeScript/releases.atom'}];
 const evidence=[];
 for(const source of sources){
  const registered=service.register({kind:'custom_rss',...source}).source;
  const run=await service.sync(registered.source_id,{idempotencyKey:'assistant-public-'+registered.source_id,signal:AbortSignal.timeout(45000)});
  const items=service.feed.snapshot(DEMO_BOARD_ID).feed_items.filter((item:any)=>item.source_id===registered.source_id);
  const latest=items.sort((a:any,b:any)=>b.source_created_at.localeCompare(a.source_created_at))[0];
  const reader=createFeedContentHandlers(service.feed,DEMO_BOARD_ID,hydrateFeedItemContent).find((handler:any)=>handler.capability_id===feedSubjectAction.capability_id);
  const context=latest?await reader.handle({actor_id:'public-fixture',permissions:['feed:read']},{subject_id:latest.item_id}):null;
  evidence.push({source:source.name,url:source.feed_url,source_id:registered.source_id,sync:run,item_count:items.length,context:context?{subject:context.subject,revision:context.revision,title:context.title,excerpt:context.content.slice(0,1600),truncated:context.truncated}:null});
 }
 const output={at:new Date().toISOString(),path:'Existing FeedSourceService → public RSS runtime → original Feed storage → original feed.subject.read',scope:'Two expressly registered public sources in isolated storage; no private accounts',builtHostRoot:root,evidence};
 const outputDir='specs/bp-delivery-parallel/work-items/personal-assistant/evidence';await mkdir(outputDir,{recursive:true});await writeFile(join(outputDir,'public-sources.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({at:output.at,sources:evidence.map(item=>({source:item.source,item_count:item.item_count,subject:item.context?.subject,title:item.context?.title,sync_outcome:item.sync.run?.outcome}))}));
 if(evidence.some(item=>!item.context))process.exitCode=1;
}finally{
 try{db?.close();}finally{
  if(oldHome===undefined)delete process.env.MOLIS_WORK_HOME;else process.env.MOLIS_WORK_HOME=oldHome;
  if(oldBackend===undefined)delete process.env.MOLIS_WORK_SECRET_BACKEND;else process.env.MOLIS_WORK_SECRET_BACKEND=oldBackend;
  await rm(home,{recursive:true,force:true});
 }
}
