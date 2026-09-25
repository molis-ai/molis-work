import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openCogniaStore, COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { withContextJourneys } from "../apps/local-host/src/context-onboarding-store.js";
import { selectContextSources, startContextJourney, waitContextJourney, adoptContextJourney, parseContextSummary, readContextJourney, reopenContextJourney, updateContextDraft } from "../apps/local-host/src/context-onboarding-service.js";
import { contextSources, readContextSource, readOnboardingGmail } from "../apps/local-host/src/context-onboarding-sources.js";
import { createContextOnboardingHttp } from "../apps/local-host/src/web-context-onboarding.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { handleLocalConnectorsSettingsHttp } from "../apps/local-host/src/web-connectors-settings.js";
import { storeGmailOAuthClient } from "../apps/local-host/src/gmail-oauth.js";
import { authorizeLocalWebRequest, type LocalMutationState } from "../apps/local-host/src/web-http.js";

const withCatalog = withMolisWorkProjectCatalog;
const hosts = new Map<string, MolisWorkLocalHost>();
async function home(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const dir = await mkdtemp(join(tmpdir(), 'molis-context-'));
  const host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }); hosts.set(dir, host);
  t.after(async () => { await host.close(); hosts.delete(dir); await rm(dir, {recursive:true,force:true}); }); return dir;
}
function pagesPorts(dir: string) {
  return { withCatalog, homeActions: () => bindActionClient(hosts.get(dir)!.homeActionClient(), () => ({ actor_id: "context-test", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS })), actions: async (_home: string, projectId: string) => {
    const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId });
    return bindActionClient(hosts.get(dir)!.actionClient(reference), () => ({ actor_id: "context-test", project_id: projectId, audience: "user", permissions: ["pages:write"] }));
  } };
}
const refs = [{label:'S1',material_id:'m1',revision:1,title:'Alpha',path:'alpha.md',body:'Launch October 8'}];

test('adoption resumes after the summary action fails without replacing imported material edits or accepted intent', async t => {
  const dir = await home(t), id = randomUUID();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: 'browser', selected: true, text: 'Adopted source body' }] });
  const base = pagesPorts(dir);
  const ports = { ...base, model: async () => ({ completeText: async () => '# Accepted project\nAdopted source body [S1]' }) };
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id); assert.equal(ready.phase, 'review');
  const failed = await adoptContextJourney(dir, id, { title: ready.summary!.title, body: ready.summary!.body }, {
    ...ports,
    actions: async (home, projectId): Promise<BoundActionClient> => {
      const client = await base.actions(home, projectId);
      return { discover: () => client.discover(), invoke: async (definition, input) => {
        if ((input as { request_id?: string }).request_id === id + ':summary') throw new Error('Summary storage temporarily unavailable');
        return client.invoke(definition, input);
      } };
    },
  });
  assert.equal(failed.phase, 'failed'); assert.match(failed.error!, /temporarily unavailable/);
  const store = openPagesStore(dir);
  try {
    const [source] = store.list(failed.project_id); assert.ok(source); assert.equal(store.list(failed.project_id).length, 1);
    store.update(source.id, { title: 'User edited source' }, failed.project_id);
    const resumed = await adoptContextJourney(dir, id, { title: 'Ignored new title', body: 'Ignored new body' }, ports);
    assert.equal(resumed.phase, 'complete'); assert.equal(resumed.project_id, failed.project_id);
    assert.equal(store.list(resumed.project_id).length, 2);
    assert.equal(store.get(source.id, resumed.project_id).title, 'User edited source');
    const summary = store.get(resumed.document_id!, resumed.project_id);
    assert.match(JSON.stringify(summary.body), /Adopted source body/); assert.match(JSON.stringify(summary.body), new RegExp(source.id));
    assert.doesNotMatch(JSON.stringify(summary), /Ignored new/);
    const replay = await adoptContextJourney(dir, id, {}, ports); assert.equal(replay.document_id, summary.id);
  } finally { store.close(); }
});

test('large materials keep their ending and resume completed model batches after failure', async t => {
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const original='# Long material\n\n'+('Ordinary work context.\n'.repeat(9000))+'FINAL FACT: launch is postponed to October 10.\n';
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[{path:'long.md',data:Buffer.from(original).toString('base64')}]}]});
  const prompts:string[]=[];let readCalls=0,failed=false;
  const ports={...pagesPorts(dir),readSource:async(h:string,s:Parameters<typeof readContextSource>[1])=>{readCalls++;return readContextSource(h,s);},model:async()=>({runtimeLabel:'batch fixture',completeText:async(prompt:string)=>{
    assert.ok(prompt.length<82_000,'each model call has a bounded serialized prompt');prompts.push(prompt);
    if(prompts.length===2&&!failed){failed=true;throw Error('Temporary batch failure');}
    return prompt.includes('这是完整材料的一部分')?'# Evidence\nWork facts retained [S1]':'# Work\nLaunch is postponed to October 10 [S1]';
  }})};
  startContextJourney(dir,id,ports);let j=await waitContextJourney(dir,id);assert.equal(j.phase,'failed');assert.equal(j.synthesis!.completed,1);assert.equal(Object.keys(j.synthesis!.notes).length,1);
  const firstBatch=prompts[0]!.split('\n').at(-2)!;
  startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);assert.equal(j.phase,'review');assert.equal(readCalls,1);assert.equal(prompts.filter(p=>p.split('\n').at(-2)===firstBatch).length,1);
  const uniqueBatches=[...new Set(prompts.filter(p=>p.includes('这是完整材料的一部分')).map(p=>p.split('\n').at(-2)!))];
  const processed=uniqueBatches.flatMap(p=>JSON.parse(p) as {body:string}[]).map(p=>p.body).join('');
  assert.equal(processed,j.summary!.references[0]!.body);assert.match(processed,/FINAL FACT: launch is postponed to October 10/);
  assert.match(j.summary!.body,/October 10/);assert.equal(j.summary!.references.length,1);
});

test('a batch cannot cite a source outside its input or pass invented evidence to final synthesis',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[{path:'long.md',data:Buffer.from('Work facts\n'.repeat(11000)).toString('base64')}]}]});
  let calls=0;startContextJourney(dir,id,{...pagesPorts(dir),model:async()=>({completeText:async()=>{calls++;return '# Invalid\nInvented evidence [S99]';}})});
  const j=await waitContextJourney(dir,id);assert.equal(j.phase,'failed');assert.match(j.error!,/有效来源/);assert.equal(calls,1);assert.equal(Object.keys(j.synthesis!.notes).length,0);assert.equal(j.summary,null);
});

test('local scope → grounded summary → one real project and editable source documents; retries preserve edits', async t => {
  const dir=await home(t), folder=join(dir,'selected');await mkdir(folder);await writeFile(join(folder,'brief.md'),'# Brief\nLaunch October 8');await writeFile(join(folder,'.secret.txt'),'private hidden');await symlink(join(folder,'brief.md'),join(folder,'link.md'));
  const id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'directory',selected:true,path:folder},{kind:'gmail',selected:true,days:7}]});
  let calls=0;
  const ports={...pagesPorts(dir),model:async()=>({runtimeLabel:'test model',completeText:async(prompt:string)=>{calls++;assert.match(prompt,/Launch October 8/);assert.doesNotMatch(prompt,/private hidden/);return '# 秋季发布\n## 当前进展\n计划于 10 月 8 日发布。[S1]\n## 下一步\n建议核对发布物料。[S1]';}})};
  startContextJourney(dir,id,ports);startContextJourney(dir,id,ports);
  const ready=await waitContextJourney(dir,id);assert.equal(ready.phase,'review');assert.equal(calls,1);assert.equal(ready.summary?.references.length,1);updateContextDraft(dir,id,{title:'已修改的草稿',body:ready.summary!.body});assert.equal(readContextJourney(dir,id).summary!.title,'已修改的草稿');assert.match(ready.sources[1]!.error!,/连接 Google/);
  const [a,b]=await Promise.all([adoptContextJourney(dir,id,{title:'用户确认的发布',body:ready.summary!.body},ports),adoptContextJourney(dir,id,{title:'用户确认的发布'},ports)]);
  assert.equal(a.phase,'complete');assert.equal(a.project_id,b.project_id);
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.ok(!catalog.listHiddenPlugins(a.project_id).includes('pages'));});
  const pages=openPagesStore(dir);try{assert.equal(pages.list(a.project_id).length,2);const summary=pages.get(a.document_id!,a.project_id);assert.match(JSON.stringify(summary.body),/openPlugin=pages/);pages.update(summary.id,{title:'手动修改后'});}finally{pages.close();}
  await adoptContextJourney(dir,id,{title:'重复请求'},ports);
  const reopened=openPagesStore(dir);try{assert.equal(reopened.get(a.document_id!).title,'手动修改后');assert.equal(reopened.list(a.project_id).length,2);}finally{reopened.close();}
  const store=openCogniaStore(dir);try{assert.equal(store.materials().length,1);}finally{store.close();}
});

test('long source and project titles fit Pages while full titles, original bodies and retry identity survive',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const sourceTitle='A'.repeat(73)+'🙂'+'B'.repeat(40),projectTitle='项目'.repeat(50);
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[{path:'message.md',data:Buffer.from('# '+sourceTitle+'\n\nOriginal mail body.').toString('base64')}]}]});
  const ports={...pagesPorts(dir),model:async()=>({completeText:async()=> '# Work\nOriginal mail body. [S1]'})};
  startContextJourney(dir,id,ports);const ready=await waitContextJourney(dir,id);assert.equal(ready.summary!.references[0]!.title,sourceTitle);
  const saved=await adoptContextJourney(dir,id,{title:projectTitle,body:ready.summary!.body},ports);assert.equal(saved.phase,'complete',saved.error??'');
  const pages=openPagesStore(dir);try{
    const docs=pages.list(saved.project_id);assert.equal(docs.length,2);assert.ok(docs.every(d=>d.title.length<=80&&d.title.isWellFormed()));
    const source=docs.find(d=>d.id!==saved.document_id)!;assert.equal(source.title,'[S1] '+'A'.repeat(73)+'…');
    const sourceBody=JSON.stringify(pages.get(source.id).body);assert.ok(sourceBody.includes(sourceTitle));assert.match(sourceBody,/Original mail body/);
    assert.ok(JSON.stringify(pages.get(saved.document_id!).body).includes(projectTitle));
    await adoptContextJourney(dir,id,{title:'Ignored retry'},ports);assert.equal(pages.list(saved.project_id).length,2);
  }finally{pages.close();}
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,projectTitle);});
});

test('missing model preserves imported bodies, restart/retry does not re-read, invalid citations cannot be adopted',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Only October 8 is confirmed',url:'https://example.com/brief'}]});
  const ports={...pagesPorts(dir),model:async()=>({})};startContextJourney(dir,id,ports);let result=await waitContextJourney(dir,id);assert.equal(result.phase,'failed');assert.match(result.error!,/文字模型/);const materialId=result.sources[0]!.references![0]!.material_id;
  startContextJourney(dir,id,{...pagesPorts(dir),readSource:async()=>{throw Error('must not read twice');},model:async()=>({completeText:async()=> '# Confirmed launch\nOctober 8 [S1]'})});result=await waitContextJourney(dir,id);assert.equal(result.phase,'review');assert.equal(result.summary!.references[0]!.material_id,materialId);
  assert.throws(()=>parseContextSummary('# Bad\nNo citations',refs),/有效来源/);assert.throws(()=>parseContextSummary('# Bad\nWrong [S2]',refs),/有效来源/);
  assert.throws(()=>contextSources([{kind:'browser',selected:true,url:'javascript:alert(1)',text:'x'}]),/网址/);
  const cancelled=randomUUID();withContextJourneys(dir,s=>{const j=s.create(cancelled);j.phase='reading';s.save(j);});assert.equal(readContextJourney(dir,cancelled).phase,'failed');
});

test('empty project is real, idempotent, and has no implicit root Goal',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const result=await adoptContextJourney(dir,id,{title:'从空白开始',blank:true},{...pagesPorts(dir)});assert.equal(result.phase,'complete');
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,'从空白开始');});
  // There is no goal command in the new flow; inspect the actual project database.
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(dir,'projects',result.project_id,'molis-work.db'));try{const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'").get();assert.ok(table);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM goals').get() as {n:number}).n,0);}finally{db.close();}
});

test('removed import preview can be rebuilt from retained material on retry',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Preserved after preview cleanup'}]});
  const store=openCogniaStore(dir);let previewId:string;
  try {previewId=store.preview({kind:'markdown',name:'Interrupted upload',locator:'upload',files:[{path:'page.md',data:Buffer.from('Preserved after preview cleanup').toString('base64')}]}).id;store.cancelPreview(previewId);} finally {store.close();}
  withContextJourneys(dir,s=>{const j=s.get(id);j.sources[0]!.preview_id=previewId;s.save(j);});
  const ports={...pagesPorts(dir),model:async()=>({completeText:async()=> '# Recovered\nPreserved after preview cleanup [S1]'})};
  startContextJourney(dir,id,ports);const failed=await waitContextJourney(dir,id);assert.equal(failed.phase,'failed');assert.equal(failed.sources[0]!.preview_id,undefined);assert.equal(failed.sources[0]!.text,'Preserved after preview cleanup');
  startContextJourney(dir,id,ports);const recovered=await waitContextJourney(dir,id);assert.equal(recovered.phase,'review');assert.equal(recovered.summary!.references.length,1);assert.match(recovered.summary!.references[0]!.body,/Preserved after preview cleanup/);
});

test('Gmail reads only chosen account/time with real MIME body parsing; network requests stay on Gmail',async t=>{
  const dir=await home(t);
  await runWithMolisWorkHome(dir,async()=>{
    const connection=withConnectorConnections(dir,s=>s.createToken({serviceId:'gmail',displayName:'Fixture account',token:'fixture-token',accountLabel:'fixture@example.com'}));
    const calls:string[]=[];
    const result=await readOnboardingGmail(dir,{kind:'gmail',selected:true,connection_id:connection.connection_id,days:7},async(input,init)=>{
      const url=new URL(String(input));calls.push(url.href);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer fixture-token');
      if(url.pathname.endsWith('/messages')){assert.equal(url.searchParams.get('q'),'newer_than:7d -in:spam -in:trash');assert.equal(url.searchParams.get('maxResults'),'20');return Response.json({messages:[{id:'abc123'}]});}
      assert.equal(url.searchParams.get('format'),'full');return Response.json({payload:{mimeType:'multipart/mixed',headers:[{name:'Subject',value:'Launch details'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Real full body content').toString('base64url')}},{mimeType:'text/plain',filename:'secret.txt',body:{data:Buffer.from('Attachment excluded').toString('base64url')}}]}});
    });
    assert.equal(calls.length,2);const body=Buffer.from(result.files[0]!.data!,'base64').toString();assert.match(body,/Real full body content/);assert.doesNotMatch(body,/Attachment excluded/);
  });
});

test('HTTP control gate, persisted selection, Google PKCE start, cancellation and callback resume correct journey',async t=>{
  const dir=await home(t),id=randomUUID(),token='onboarding-control-test';const handle=createContextOnboardingHttp({...pagesPorts(dir),model:async()=>({})});
  const keys=new Map<string,LocalMutationState>();
  const server=createServer((req,res)=>{const url=new URL(req.url!,'http://127.0.0.1');if(!authorizeLocalWebRequest(req,res,url,token,keys))return;void runWithMolisWorkHome(dir,async()=>{if(await handle(req,res,url,dir))return;if(await handleLocalConnectorsSettingsHttp(req,res,url,dir))return;res.writeHead(404);res.end();}).catch(error=>{res.writeHead(500);res.end(JSON.stringify({error:error.message}));});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const address=server.address() as {port:number};const origin='http://127.0.0.1:'+address.port;
  const post=async(path:string,body:unknown)=>fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':randomUUID()},body:JSON.stringify(body)});
  assert.equal((await fetch(origin+'/api/onboarding/context',{method:'POST',body:'{}'})).status,403);
  await post('/api/onboarding/context',{id});await post('/api/onboarding/context/'+id+'/selection',{sources:[{kind:'gmail',selected:true,days:7}],auto_start:true});
  runWithMolisWorkHome(dir,()=>storeGmailOAuthClient({clientId:'fixture.apps.googleusercontent.com'}));
  const metadata=await(await fetch(origin+'/api/onboarding/context')).json();assert.equal(metadata.resume.id,id);assert.equal(metadata.resume.title,'未完成的整理');
  const begun=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const consent=new URL(begun.authorizationUrl);assert.equal(consent.hostname,'accounts.google.com');assert.equal(consent.searchParams.get('code_challenge_method'),'S256');assert.equal(begun.redirectUri,origin+'/api/feed/connectors/gmail/oauth/callback');
  const cancelled=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?error=access_denied&state='+begun.state,{redirect:'manual'});assert.equal(cancelled.status,302);assert.match(cancelled.headers.get('location')!,new RegExp('journey='+id+'&oauth=cancelled'));assert.equal(readContextJourney(dir,id).auto_start,false);assert.equal((await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=late-code&state='+begun.state,{redirect:'manual'})).status,400);
  const begun2=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const realFetch=globalThis.fetch;
  globalThis.fetch=(async(input,init)=>{const url=String(input);if(url.startsWith('https://oauth2.googleapis.com/'))return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});if(url.endsWith('/gmail/v1/users/me/profile'))return Response.json({emailAddress:'test@example.com'});return realFetch(input,init);}) as typeof fetch;
  try {const done=await realFetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=fixture-code&state='+begun2.state,{redirect:'manual'});assert.equal(done.status,302);assert.match(done.headers.get('location')!,/oauth=connected/);assert.equal(readContextJourney(dir,id).sources[0]!.connection_id,begun2.connection_id);}
  finally{globalThis.fetch=realFetch;}
  const replay=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=fixture-code&state='+begun2.state,{redirect:'manual'});assert.equal(replay.status,400);
  const expired=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  runWithMolisWorkHome(dir,()=>{const store=createFileSecretStore(),ref='connector:gmail:oauth:connection-target:'+expired.state,pending=JSON.parse(store.get(ref)!);pending.createdAt=Date.now()-11*60_000;store.put(ref,JSON.stringify(pending));});
  const timedOut=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=unused&state='+expired.state,{redirect:'manual'});
  assert.equal(timedOut.status,302);assert.match(timedOut.headers.get('location')!,new RegExp('journey='+id+'&oauth=failed'));assert.match(readContextJourney(dir,id).error!,/过期/);
  const older=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const newer=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?error=access_denied&state='+older.state,{redirect:'manual'});
  assert.equal(readContextJourney(dir,id).oauth_state,newer.state);assert.equal(readContextJourney(dir,id).oauth_status,'pending');
  await post('/api/onboarding/context/'+id+'/selection',{sources:[{kind:'gmail',selected:false,days:7}],auto_start:false});
  await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=unused&state='+newer.state,{redirect:'manual'});
  assert.equal(readContextJourney(dir,id).oauth_status,'cancelled');assert.equal(readContextJourney(dir,id).sources[0]!.selected,false);
});

test('abandoned OAuth expires on resume without losing selected materials',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>{const j=s.create(id);j.sources=[{kind:'browser',selected:true,text:'Retained work'}];j.oauth_status='pending';j.oauth_expires_at=Date.now()-1;j.auto_start=true;s.save(j);});
  const resumed=readContextJourney(dir,id);assert.equal(resumed.oauth_status,'failed');assert.equal(resumed.auto_start,false);assert.match(resumed.error!,/过期/);assert.equal(resumed.sources[0]!.text,'Retained work');
  assert.equal(withContextJourneys(dir,s=>s.get(id)).oauth_status,'failed');
});

test('creation failure after project registration resumes exactly that project, and materials-only remains usable without AI',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Fixture preserved body'}]});
  startContextJourney(dir,id,{...pagesPorts(dir),model:async()=>({})});await waitContextJourney(dir,id);
  const failAfterCreate:typeof withCatalog=async(options,operation)=>{await withCatalog(options,operation);throw new Error('Simulated response loss after project creation');};
  const first=await adoptContextJourney(dir,id,{title:'Without AI',materials_only:true},{...pagesPorts(dir),withCatalog:failAfterCreate});assert.match(first.error!,/response loss/);
  const second=await adoptContextJourney(dir,id,{title:'retry ignored',materials_only:true},{...pagesPorts(dir)});assert.equal(second.phase,'complete');assert.equal(second.error,null);
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,'Without AI');});
  const pages=openPagesStore(dir);try{assert.equal(pages.list(second.project_id).length,2);assert.match(JSON.stringify(pages.list(second.project_id)),/Fixture preserved body/);}finally{pages.close();}
});

test('ordinary entry can discover unfinished work without empty or completed attempts hiding it',async t=>{
  const dir=await home(t),active=randomUUID(),empty=randomUUID(),completed=randomUUID();
  withContextJourneys(dir,s=>s.create(active));
  selectContextSources(dir,active,{sources:[{kind:'browser',selected:true,text:'Unsummarized work'}]});
  withContextJourneys(dir,s=>{s.create(empty);const j=s.create(completed);j.phase='complete';s.save(j);assert.equal(s.latestIncomplete()!.id,active);});
  const other=await home(t);assert.equal(withContextJourneys(other,s=>s.latestIncomplete()),null);
});

test('partial failure can be adjusted and retried while successful material snapshots stay fixed',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'First confirmed fact'},{kind:'chat',selected:true,files:[{path:'chat.txt',data:Buffer.from('Second confirmed fact').toString('base64')}]}]});
  let browserReads=0,chatReads=0;
  const ports={...pagesPorts(dir),readSource:async(h:string,s:Parameters<typeof readContextSource>[1])=>{if(s.kind==='browser')browserReads++;if(s.kind==='chat'&&++chatReads===1)throw Error('Temporary chat import failure');return readContextSource(h,s);},model:async()=>({completeText:async()=> '# Work\nConfirmed fact [S1]'})};
  startContextJourney(dir,id,ports);let j=await waitContextJourney(dir,id);assert.equal(j.phase,'review');assert.match(j.sources[1]!.error!,/Temporary/);const savedId=j.sources[0]!.references![0]!.material_id;
  j=reopenContextJourney(dir,id);assert.ok(j.summary,'existing draft survives until user starts again');selectContextSources(dir,id,{sources:j.sources});
  startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);assert.equal(j.summary!.references.length,2);assert.equal(browserReads,1);assert.equal(chatReads,2);assert.equal(j.sources[0]!.references![0]!.material_id,savedId);
  j=reopenContextJourney(dir,id);j.sources[0]!.text='Changed scope';j.sources[1]!.selected=false;
  selectContextSources(dir,id,{sources:j.sources});startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);
  assert.equal(browserReads,2);assert.equal(chatReads,2,'unselected chat must not be read');assert.equal(j.summary!.references.length,1);assert.match(j.summary!.references[0]!.body,/Changed scope/);assert.notEqual(j.summary!.references[0]!.material_id,savedId);
});

test('interrupted blank adoption resumes persisted acceptance without requiring a nonexistent summary',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const failAfterCreate:typeof withCatalog=async(options,operation)=>{await withCatalog(options,operation);throw Error('Lost creation response');};
  const accepted=await adoptContextJourney(dir,id,{title:'Accepted blank project',blank:true},{...pagesPorts(dir),withCatalog:failAfterCreate});assert.equal(accepted.phase,'failed');assert.equal(accepted.summary,null);
  withContextJourneys(dir,s=>{const j=s.get(id);j.phase='adopting';s.save(j);});
  const recovered=readContextJourney(dir,id);assert.equal(recovered.phase,'failed');assert.equal(recovered.adoption!.title,'Accepted blank project');
  assert.throws(()=>reopenContextJourney(dir,id),/不能更改来源/);assert.throws(()=>startContextJourney(dir,id,{...pagesPorts(dir)}),/继续保存/);
  const saved=await adoptContextJourney(dir,id,{}, {...pagesPorts(dir)});assert.equal(saved.phase,'complete');assert.equal(saved.project_id,accepted.project_id);
  await withCatalog({homeDirectory:dir},catalog=>assert.equal(catalog.listProjects().length,1));
  const pages=openPagesStore(dir);try{assert.equal(pages.list(saved.project_id).length,1);assert.equal(pages.get(saved.document_id!).title,'Accepted blank project · 工作摘要');}finally{pages.close();}
});
