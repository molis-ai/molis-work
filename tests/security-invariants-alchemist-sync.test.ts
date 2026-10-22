import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAlchemistSyncStore,createAlchemistStudioRuntime,alchemistActions as a} from '@molis-ai/molis-work-plugin-alchemist';
import {ensureStorageSpace,personalStorageSpace,describeSqliteSchema} from '@molis-ai/molis-work-storage';
import {personalStudio,savedStudio} from './fixtures/alchemist-sync.js';

test('S-78 PCSYNC-ALC-ACTOR-01 Studio retains real authors, reports, evidence, methods and decisions without restoring execution or credentials',async t=>{
 const root=mkdtempSync(join(tmpdir(),'studio-sync-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const left=personalStudio(join(root,'a')),saved=await savedStudio(left);t.after(()=>left.runtime.close());
 const {annotation}=await left.runtime.actionsFor('assistant:reviewer').invoke(a.annotationCreate,{target:{kind:'lens_report',objectId:saved.report.id,revision:saved.report.revision,blockId:'summary'},quotedSnapshot:saved.report.summary,comment:'Independent review'});
 const actors=left.runtime.database.prepare('SELECT * FROM workspace_actors ORDER BY id').all();
 assert.deepEqual(actors.map(row=>row.id),['alice','assistant:reviewer'],'trusted callers do not create a placeholder actor');
 const home=join(root,'b');ensureStorageSpace(home,left.space);
 const source=openAlchemistSyncStore(join(root,'a'),'project'),target=openAlchemistSyncStore(home,'project');t.after(()=>{source.close();target.close();});
 const context={spaceId:left.space.spaceId,projectId:'project',title:'Research',authorize(){}};
 const x=source.replica(context),y=target.replica(context),first=x.next()!;assert.ok(first);assert.doesNotMatch(JSON.stringify(first.value),/input_json|checkpoint_json|lease_owner|runtime_settings|source_settings|ui_context/);
 y.receive({...first,revision:1});assert.deepEqual(y.conflicts(),[]);x.acknowledge(first.key,first.operationId,1);assert.equal(y.next(),null);
 const right=personalStudio(home);t.after(()=>right.runtime.close());
 assert.deepEqual(right.runtime.database.prepare('SELECT * FROM workspace_actors ORDER BY id').all(),actors);
 assert.equal(right.runtime.database.prepare('SELECT actor_id FROM annotations WHERE id=?').get(annotation.id).actor_id,'assistant:reviewer');
 assert.equal(right.runtime.database.prepare('SELECT actor_id FROM decisions LIMIT 1').get().actor_id,'alice');
 assert.equal((await right.call(a.researchGet,{id:saved.idea.id,version:1})).lenses.market_space.report!.summary,saved.report.summary);
 assert.equal((await right.call(a.memoryGet,{})).playbook[0]!.version,2);assert.equal((await right.call(a.decisionsList,{})).log.length,1);
 assert.equal((await right.call(a.pulseReports,{})).reports.length,1);assert.equal((await right.call(a.conversationList,{})).messages.length,2);
 assert.equal(right.requests.length,0);await right.runtime.runPending();assert.equal(right.requests.length,0);
 assert.ok(right.runtime.database.prepare("SELECT 1 FROM jobs WHERE input_json='{}' AND lease_owner IS NULL AND checkpoint_json IS NULL AND attempt=0").get());
 const leftEdit=await left.call(a.playbookEditing,{id:saved.rule.id}),rightEdit=await right.call(a.playbookEditing,{id:saved.rule.id});
 for(const [f,edit,method]of [[left,leftEdit,'Source branch'],[right,rightEdit,'Target branch']] as const)await f.call(a.playbookRevise,{id:saved.rule.id,expectedVersion:2,expectedEtag:edit.etag,methodChange:method,positiveExamples:[],negativeExamples:[]});
 const stale=await right.call(a.playbookEditing,{id:saved.rule.id});const change=x.next()!;y.receive({...change,revision:2});assert.equal(y.conflicts().length,1);y.resolve(change.key,'remote',2);
 assert.equal((await right.call(a.playbookEditing,{id:saved.rule.id})).rule.version,stale.rule.version,'same numeric version can hold another branch');
 const before=right.runtime.database.prepare('SELECT * FROM research_playbook_revisions ORDER BY rule_id,version').all();
 await assert.rejects(right.call(a.playbookRevise,{id:saved.rule.id,expectedVersion:stale.rule.version,expectedEtag:stale.etag,methodChange:'Must refuse',positiveExamples:[],negativeExamples:[]}),{code:'alchemist.edit_changed'});
 assert.deepEqual(right.runtime.database.prepare('SELECT * FROM research_playbook_revisions ORDER BY rule_id,version').all(),before);
 const edit=await right.call(a.directionEditing,{id:saved.direction.id});
 await right.call(a.directionStatus,{id:saved.direction.id,status:'archived'});
 await assert.rejects(right.call(a.directionUpdate,{id:saved.direction.id,title:'Stale',description:'Must not overwrite',expectedEtag:edit.etag}),{code:'alchemist.edit_changed'});
 const schema=new DatabaseSync(':memory:');try{schema.exec(readFileSync(new URL('./fixtures/home-store-schemas/alchemist-studio-v2.sql',import.meta.url),'utf8'));assert.deepEqual(describeSqliteSchema(right.runtime.database),describeSqliteSchema(schema));}finally{schema.close();}
});

test('S-78 PCSYNC-ALC-ACTOR-02 Studio refuses invalid authors, injected scope, task execution and broken references atomically',async t=>{
 const root=mkdtempSync(join(tmpdir(),'studio-sync-invalid-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const f=personalStudio(join(root,'source'));t.after(()=>f.runtime.close());await savedStudio(f);
 const home=join(root,'target');ensureStorageSpace(home,f.space);const source=openAlchemistSyncStore(join(root,'source'),'project'),target=openAlchemistSyncStore(home,'project');t.after(()=>{source.close();target.close();});
 const context={spaceId:f.space.spaceId,projectId:'project',title:'Research',authorize(){}};const x=source.replica(context),y=target.replica(context),m=x.next()!;
 const targetDb=new DatabaseSync(join(home,'alchemist/projects/project/studio.sqlite'),{readOnly:true});t.after(()=>targetDb.close());
 type Wire={spaceId:string;project:{id:string};graph:Record<string,Record<string,string|number|null>[]>};
 const changes=[(w:Wire)=>{w.spaceId='foreign';},(w:Wire)=>{w.project.id='foreign-project';},(w:Wire)=>{w.graph.jobs![0]!.status='queued';},(w:Wire)=>{w.graph.jobs![0]!.input_json='{"execute":"no"}';},(w:Wire)=>{w.graph.lens_runs![0]!.idea_version=999;},(w:Wire)=>{w.graph.claim_evidence![0]!.evidence_id='missing';},(w:Wire)=>{w.graph.research_playbook_rules![0]!.positive_examples_json='null';},
  (w:Wire)=>{w.graph.workspace_actors=[];},(w:Wire)=>{w.graph.workspace_actors![0]!.workspace_id='foreign-workspace';},
  (w:Wire)=>{w.graph.workspace_actors![0]!.id='';},(w:Wire)=>{w.graph.workspace_actors![0]!.kind='administrator';},
  (w:Wire)=>{w.graph.workspace_actors!.push({...w.graph.workspace_actors![0]!});},(w:Wire)=>{w.graph.annotations![0]!.actor_id='missing-author';},
  (w:Wire)=>{const row=w.graph.research_playbook_revisions![0]!,snapshot=JSON.parse(String(row.snapshot_json));snapshot.actorId='missing-author';row.snapshot_json=JSON.stringify(snapshot);},
 ];
 let revision=0;for(const corrupt of changes){const value=structuredClone(m.value) as Wire;corrupt(value);y.receive({...m,value,operationId:'invalid:'+revision,revision:++revision});assert.equal(y.conflicts().length,1);assert.throws(()=>y.resolve(m.key,'remote',revision));assert.equal(y.counts().pending,0);assert.equal(targetDb.prepare('SELECT (SELECT COUNT(*) FROM workspaces)+(SELECT COUNT(*) FROM workspace_actors) AS n').get().n,0,'invalid graphs must roll back workspace and author rows too');}
 y.receive({...m,revision:++revision});y.resolve(m.key,'remote',revision);assert.deepEqual(y.conflicts(),[]);assert.equal(y.next(),null);
 let revoked=true;const fenced=target.replica({...context,authorize(){if(revoked)throw Error('Withdrawn');}});assert.throws(()=>fenced.receive({...m,revision:++revision}),/Withdrawn/);revoked=false;assert.equal(fenced.cursor(),revision-1);
});

test('S-78 PCSYNC-12/15 Studio refuses old schema intact and cannot overwrite a foreground model wait or follow a project symlink',async t=>{
 const root=mkdtempSync(join(tmpdir(),'studio-sync-active-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const f=personalStudio(join(root,'active'));t.after(()=>f.runtime.close());const {direction}=await f.call(a.directionCreate,{description:'保存方向并等待模型'});
 const editing=await f.call(a.directionEditing,{id:direction.id});assert.equal(a.directionUpdate.version,2);assert.equal(a.playbookRevise.version,2);
 await assert.rejects(f.runtime.actions.invoke(a.directionUpdate,{id:direction.id,description:'No precondition'} as never),{code:'alchemist.direction_input_invalid'});
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});
 const waitHome=join(root,'waiting');ensureStorageSpace(waitHome,f.space);
 const waitingRuntime=createAlchemistStudioRuntime({databasePath:join(waitHome,'alchemist/projects/project/studio.sqlite'),storage:{space:f.space,projectId:'project'},ai:{...f.ai,generate:async input=>{entered();await gate;return f.ai.generate(input);}}});
 t.after(async()=>{release();await waitingRuntime.close();});
 const active=waitingRuntime.actions.invoke(a.conversationSend,{body:'Keep foreground active',context:{kind:'surface',label:'方向',surface:'ideas'}});await waiting;
 const store=openAlchemistSyncStore(waitHome,'project');t.after(()=>store.close());const replica=store.replica({spaceId:f.space.spaceId,projectId:'project',title:'Research',authorize(){}});
 assert.throws(()=>replica.next(),/仍在本机处理/);
 const key=JSON.stringify(['project','project_studio','project']);replica.receive({key,operationId:'delete-during-wait',base:0,revision:1,value:null});
 assert.throws(()=>replica.resolve(key,'remote',1),/仍在本机处理/);assert.equal(waitingRuntime.database.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,1);
 release();await active;replica.resolve(key,'local',1);assert.ok(replica.next());
 const oldHome=join(root,'old');ensureStorageSpace(oldHome,f.space);const directory=join(oldHome,'alchemist/projects/project');mkdirSync(directory,{recursive:true});const file=join(directory,'studio.sqlite'),db=new DatabaseSync(file);db.exec(readFileSync(new URL('./fixtures/home-store-schemas/alchemist-studio-v1.sql',import.meta.url),'utf8')+'PRAGMA user_version=1');db.close();const original=readFileSync(file);
 assert.throws(()=>openAlchemistSyncStore(oldHome,'project'),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(file),original);
 mkdirSync(join(oldHome,'alchemist/projects/linked-parent'));symlinkSync(join(oldHome,'alchemist/projects/linked-parent'),join(oldHome,'alchemist/projects/link'));assert.throws(()=>openAlchemistSyncStore(oldHome,'link'),{code:'alchemist.sync_scope'});
 const dangling=join(oldHome,'alchemist/projects/dangling');mkdirSync(dangling);symlinkSync(join(root,'must-not-create.sqlite'),join(dangling,'studio.sqlite'));assert.throws(()=>openAlchemistSyncStore(oldHome,'dangling'),{code:'alchemist.sync_scope'});
 assert.equal((await f.call(a.directionEditing,{id:direction.id})).etag,editing.etag);
});
