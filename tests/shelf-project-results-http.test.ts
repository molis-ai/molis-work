import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { openTestShelfStore } from "./shelf-direct-actions.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

test("Shelf explicitly receives a genuine fixed Coding report, preserves edited copies on retry and saves the copy into project knowledge", async t => {
  const home = mkdtempSync(join(tmpdir(), "shelf-results-"));
  const catalogStore=await openMolisWorkProjectCatalog({homeDirectory:home});
  const project=await catalogStore.createProject({display_name:'成果回流验证',actor_id:'web-user'});
  catalogStore.addProjectPlugin({project_id:project.project_id,plugin_id:'coding',actor_id:'web-user'});
  assert.throws(()=>catalogStore.addProjectPlugin({project_id:project.project_id,plugin_id:'artifacts',actor_id:'web-user'}),
    (error:unknown)=>error instanceof Error && 'code' in error && error.code==='catalog.plugin_not_found');catalogStore.close();
  const databasePath=project.database_path,projectId=project.project_id,prefix='/projects/'+project.project_id;
  const store = new LocalProjectDatabase(databasePath), app = new GoalProjectApplication(store), library = openProjectVersionStores(store);
  await codingSessions(store).create(noEffect, { project_id: projectId, session_id: "app", title: "下一轮", runtime_id: "prologue", at: new Date().toISOString() });
  const token = 'shelf-result-test-control-token-123456789';
  let server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address=server.address(); assert.ok(address && typeof address!=='string'); let origin=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{ await new Promise<void>(resolve=>server.close(()=>resolve())); await releaseProjectPlugins(store,projectId); store.close(); rmSync(home,{recursive:true,force:true}); });
  const request=async(path:string,body?:unknown,authorized=true)=>{const response=await fetch(origin+prefix+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{origin,'content-type':'application/json','x-molis-work-idempotency-key':randomUUID(),...(authorized?{'x-molis-work-control-token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  // A request the artifact and output services refuse is the caller's mistake: 400, and the body names the owner's code (the route answers by kind, not by message).
  const refused=(response:{status:number;body:{code?:string}},code:string)=>assert.deepEqual([response.status,response.body.code],[400,code],JSON.stringify(response.body));
  const reference={artifact_id:'coding-report:session-original:run-original',version:1};
  const input={...pinnedArtifact('已固定的原报告'),project_id:projectId,actor_id:'web-user',...reference,artifact_type_id:'coding.report.v1',schema_version:1,
    producer:{plugin_id:'io.molis.work.coding',plugin_version:'1.20.0',binding_signature:'official-coding-binding'},
    content:{kind:'inline' as const,payload:{title:'已固定的原报告',run_id:'run-original',source:{session_id:'session-original'},body_markdown:'## 完整原文\r\n含 ``` 与 <script>，不重新请求模型。\n最后一行🌲'}}};
  const original=library.artifacts.commands.registerVersion(input).artifact;
  const shelf=openTestShelfStore(home,{disabled:true});
  const base='/api/plugins/io.molis.work.shelf',path=base+'/project-result';
  const read=()=>request(path+'?artifact_id='+encodeURIComponent(reference.artifact_id)+'&version=1');
  const catalog=await request(base+'/project-results'); assert.equal(catalog.status,200,JSON.stringify(catalog.body)); assert.equal(catalog.body.results.length,1);
  // The first plugin request starts the Home instance, which places the first-run sample (D6): count the shelf after that.
  const before=(await shelf.snapshot()).materials.length;
  const preview=await read(); assert.equal(preview.status,200); assert.ok(preview.body.text.endsWith(input.content.payload.body_markdown));
  assert.equal((await shelf.snapshot()).materials.length,before,'reading candidates does not admit copies');
  const confirmation={reference,expected_fingerprint:preview.body.fingerprint,text:'forged body',source:{artifact_id:'forged'}};
  assert.equal((await request(path,confirmation,false)).status,403);
  // W3-02-F-INTEGRATION: the owner's stale fingerprint is conflict (409), while other invalid requests remain 400.
  const stale = await request(path,{...confirmation,expected_fingerprint:'stale'});
  assert.deepEqual([stale.status,stale.body.code],[409,'shelf.conflict'],JSON.stringify(stale.body));
  const received=await request(path,confirmation); assert.equal(received.status,200,JSON.stringify(received.body));
  const item=received.body.item; assert.deepEqual(item.artifact_source.reference,reference);
  assert.equal(shelf.readFile(item.item_id).bytes.toString('utf8'),preview.body.text);
  assert.equal((await request(path,confirmation)).body.item.item_id,item.item_id); assert.equal((await shelf.snapshot()).materials.length,before+1);
  await shelf.writeCopy(item.item_id,'只改 Shelf 副本，来源保持。');
  assert.equal((await request(path,confirmation)).body.item.item_id,item.item_id);
  assert.equal(shelf.readFile(item.item_id).bytes.toString('utf8'),'只改 Shelf 副本，来源保持。');
  const materialPath='/api/plugins/io.molis.work.shelf/items/'+item.item_id+'/project-material';
  const material=await request(materialPath); assert.equal(material.status,200);
  assert.deepEqual(material.body.payload.source.artifact.reference,reference);
  // Saved into the project's knowledge as an imported document with the edited copy's text (specs/project-knowledge §9).
  const published=await request(materialPath,{expected_fingerprint:material.body.fingerprint}); assert.equal(published.status,200,JSON.stringify(published.body));
  const saved=library.artifacts.query.getArtifactVersion(projectId,published.body.reference)!;
  assert.equal(saved.artifact_type_id,'io.molis.work.document'); assert.ok(JSON.stringify(saved.payload).includes('只改 Shelf 副本，来源保持。'));
  const restarted=openTestShelfStore(home,{disabled:true}); assert.deepEqual(restarted.readFile(item.item_id).item.artifact_source,item.artifact_source);
  await shelf.hide(item.item_id); assert.equal((await request(path,confirmation)).body.item.item_id,item.item_id); assert.equal((await shelf.snapshot()).materials.find(i=>i.item_id===item.item_id)?.hidden,false);
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  server=createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const nextAddress=server.address();assert.ok(nextAddress && typeof nextAddress!=='string');origin=`http://127.0.0.1:${nextAddress.port}`;
  assert.equal((await request(path,confirmation)).body.item.item_id,item.item_id,'host restart does not duplicate the import');
  assert.equal(shelf.readFile(item.item_id).bytes.toString('utf8'),'只改 Shelf 副本，来源保持。');
  assert.deepEqual(library.artifacts.query.getArtifactVersion(projectId,reference),original);
  library.artifacts.commands.registerVersion({...input,artifact_id:'coding-report:forged:run-original'});
  library.artifacts.commands.registerVersion({...input,version:2});
  assert.equal((await request(base+'/project-results')).body.results.length,1);
  refused(await request(path+'?artifact_id='+encodeURIComponent(reference.artifact_id)+'&version=2'),'coding.shelf_material_invalid');
  refused(await request(path+'?artifact_id=unknown&version=1'),'shelf.unavailable');
  app.initializeBoard({project_id:'foreign',actor_id:'web-user',idempotency_key:'other'});
  const foreign={...input,project_id:'foreign',artifact_id:'coding-report:foreign:run-original',content:{kind:'inline' as const,payload:{...input.content.payload,source:{session_id:'foreign'}}}};
  library.artifacts.commands.registerVersion(foreign);
  refused(await request(path+'?artifact_id='+encodeURIComponent(foreign.artifact_id)+'&version=1'),'shelf.unavailable');
  const unavailable={...input,artifact_id:'coding-report:unavailable:run-original',content:{kind:'inline' as const,payload:{...input.content.payload,source:{session_id:'unavailable'}}}};
  library.artifacts.commands.registerVersion(unavailable);
  const priorUnavailable=await request(path+'?artifact_id='+encodeURIComponent(unavailable.artifact_id)+'&version=1');assert.equal(priorUnavailable.status,200);
  library.artifacts.commands.markUnavailable({project_id:projectId,actor_id:'web-user',artifact_id:unavailable.artifact_id,version:1,reason:'原正文失效'});
  // The artifact owner refuses an unavailable version with its own code (W3-02-I25), and Shelf passes it on as the owner's.
  const unavailableRefusal=await request(path,{reference:{artifact_id:unavailable.artifact_id,version:1},expected_fingerprint:priorUnavailable.body.fingerprint});
  refused(unavailableRefusal,'artifacts.plugin_incompatible');
  assert.match(String(unavailableRefusal.body.error),/已失效/,'the person is told in words, not the reason token');
  assert.equal((await shelf.snapshot()).materials.length,before+1);
  library.artifacts.commands.archiveVersion({project_id:projectId,actor_id:'web-user',...reference});
  refused(await read(),'artifacts.plugin_incompatible'); refused(await request(path,confirmation),'artifacts.plugin_incompatible');
  assert.equal((await request(base+'/project-results')).body.results.length,0);
  assert.equal(shelf.readFile(item.item_id).bytes.toString('utf8'),'只改 Shelf 副本，来源保持。','source archival does not rewrite the independent copy');
});
