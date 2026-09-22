import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { CODING_CLIENT_FACTORY_SCRIPT, CODING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

test("Coding formal routes preserve drafts and isolate projects across server restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "coding-product-http-"));
  const token = "coding-product-control-token-0123456789abcdef";
  let server: ReturnType<typeof createMolisWorkWebServer>;
  let origin = "";
  async function start() {
    server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    origin = `http://127.0.0.1:${address.port}`;
  }
  async function request(url: string, method = "GET", body?: unknown, authorized = true) {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json",
      "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? {"x-molis-work-control-token":token} : {}) },
      ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    return {status:response.status, body:await response.json()};
  }
  const close = () => new Promise<void>(resolve => server.close(() => resolve()));
  try {
    new Function('return (' + CODING_CLIENT_FACTORY_SCRIPT + ')');
    new Function(CODING_SETTINGS_CLIENT_SCRIPT);
    await start();
    const projects = [];
    for (const name of ["A","B"]) {
      const created = await request('/api/settings/projects','POST',{display_name:name,user_confirmed:true});
      assert.equal(created.status,201);
      projects.push(created.body.project.project_id);
    }
    // Shelf is personal and always available; it is not a per-project opt-in.
    const shelfOutput = `/projects/${projects[0]}/api/plugins/io.molis.work.shelf/material-output`;
    assert.deepEqual((await request(shelfOutput)), { status: 200, body: { reference: null } });
    assert.equal((await request(shelfOutput, 'POST', { reference: null, expected_reference: null }, false)).status, 403);
    const shelfItem = await request('/api/shelf/items', 'POST', { filename: 'port.md', bytes_base64: Buffer.from('固定端口材料').toString('base64') });
    assert.equal(shelfItem.status, 200);
    const projectMaterial = `/projects/${projects[0]}/api/shelf/items/${shelfItem.body.item.item_id}/project-material`;
    const materialPreview = await request(projectMaterial);
    assert.equal(materialPreview.status, 200);
    const fixedMaterial = await request(projectMaterial, 'POST', { expected_fingerprint: materialPreview.body.fingerprint });
    assert.equal(fixedMaterial.status, 200);
    assert.equal((await request(shelfOutput, 'POST', { reference: fixedMaterial.body.reference, expected_reference: null })).status, 200);
    assert.deepEqual((await request(shelfOutput)).body.reference, fixedMaterial.body.reference);
    assert.deepEqual((await request(`/projects/${projects[1]}/api/plugins/io.molis.work.shelf/material-output`)).body.reference, null);
    const plugin = (project: string) => `/projects/${project}/api/plugins/io.molis.work.coding`;
    assert.equal((await request(plugin(projects[0])+'/state')).status,404);
    for(const project of projects) assert.equal((await request(`/api/settings/projects/${project}/plugins`,'POST',{plugin_id:'coding'})).status,200);
    const a=plugin(projects[0]),b=plugin(projects[1]);
    assert.equal((await request(a+'/sessions','POST',{title:'denied'},false)).status,403);
    const created=await request(a+'/sessions','POST',{title:'待检查的任务'});
    assert.equal(created.status,200);
    const session=created.body.session.session_id;
    assert.equal(created.body.session.state,'idle');
    const shelfChoices = await request(a+'/sessions/'+session+'/materials');
    assert.equal(shelfChoices.status, 200);
    assert.equal(shelfChoices.body.materials[0].source, 'Shelf 材料输入');
    assert.deepEqual(shelfChoices.body.materials[0].reference, fixedMaterial.body.reference);
    const draft='保留需求、证据与未解决问题\n不要假装已经执行。';
    const configuration={intent:'execute',provider_id:'saved-provider',model_id:'saved-model',workspace_id:'saved-workspace'};
    const question_drafts={ '["run-1","question-1",1]': { answers: [{question:1,indexes:[2],other:'保留原输入'}] } };
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{draft,question_drafts,configuration,mcp_sources:[{server:'docs-service',configuration_version:3}],mcp_tools:[{server:'retained-server',tool:'retained-tool',version:'schema-1',configuration_version:2}],methods:[{skill_id:'coding-review-change',version:1}]})).status,200);
    assert.equal((await request(b+'/sessions/'+session)).status,404);
    assert.equal((await request(b+'/sessions/'+session+'/recovery')).status,404);
    assert.equal((await request(b+'/sessions/'+session+'/runs/other/recover','POST',{expected_version:1})).status,404);
    assert.equal((await request(a+'/sessions/'+session+'/runs/other/recover','POST',{expected_version:1},false)).status,403);
    for (const suffix of ['/changeset', '/changeset/output', '/changeset/feedback']) {
      assert.equal((await request(a+'/sessions/'+session+'/runs/other'+suffix,'POST',{},false)).status,403);
      assert.equal((await request(b+'/sessions/'+session+'/runs/other'+suffix,'POST',{})).status,404);
    }
    assert.equal((await request(a+'/sessions/'+session+'/recovery')).status,400);

    assert.equal((await request(b+'/sessions/'+session,'PATCH',{draft:'wrong project'})).status,404);
    assert.equal((await request(b+'/sessions/'+session,'PATCH',{question_drafts:{wrong:'project'}})).status,404);
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{question_drafts:[]})).status,400);
    assert.equal((await request(a+'/sessions/'+session+'/runs','POST',{task:'read',intent:'discuss',workspace_id:'invented'})).status,400);
    assert.equal((await request(a+'/sessions/'+session)).body.session.runtime_session_id,null);
    const state=await request(a+'/state');assert.equal(state.status,200);assert.deepEqual(state.body.workspaces,[]);
    const settingsResponse = await fetch(origin + '/settings/coding-settings?project=' + projects[0]);
    assert.equal(settingsResponse.status, 200);
    const settingsHtml = await settingsResponse.text();
    assert.match(settingsHtml, /data-coding-settings/);
    for (const runtime of state.body.runtimes) assert.ok(settingsHtml.includes(runtime.display_name));
    assert.match(settingsHtml, /支持安装和显式选择/);
    assert.match(settingsHtml, /只读子任务协作/);
    assert.match(settingsHtml, /主任务只读；已分配子目录逐笔审查写入/);
    assert.ok(settingsHtml.includes('/projects/' + projects[0] + '/'));
    const modelSettingsHtml = await (await fetch(origin + '/settings/models')).text();
    assert.ok(modelSettingsHtml.includes('/settings/coding-settings'));
    const workspace = path.join(root,'method-source');await mkdir(path.join(workspace,'skills','source-review'),{recursive:true});
    await writeFile(path.join(workspace,'skills/source-review/SKILL.md'),'---\nname: source-review\ndescription: Check source evidence\n---\nRead the requested file before giving a conclusion.');
    const bound=await request('/projects/'+projects[0]+'/api/workspaces','POST',{workspace_path:workspace,user_confirmed:true});
    assert.equal(bound.status,201);
    const workspaceId=(await request(a+'/state')).body.workspaces[0].workspace_id;
    assert.equal((await request(a+'/methods/discover','POST',{workspace_id:'invented',path:'skills'})).status,400);
    const discovered=await request(a+'/methods/discover','POST',{workspace_id:workspaceId,path:'skills'});
    assert.equal(discovered.status,200,JSON.stringify(discovered.body));assert.equal(discovered.body.candidates.length,1);
    const candidate=discovered.body.candidates[0];
    assert.equal((await request(b+'/methods/install','POST',{candidate_id:candidate.candidate_id})).status,400);
    assert.equal((await request(a+'/methods/install','POST',{candidate_id:candidate.candidate_id},false)).status,403);
    const mcpInput={expected_version:0,label:'HTTP fixture',transport:'http',endpoint:'http://127.0.0.1:1/mcp',enabled:true,timeout_ms:1000,auth:{kind:'none'}};
    assert.equal((await request(a+'/mcp','POST',mcpInput,false)).status,403);
    assert.equal((await request(a+'/mcp','POST',{...mcpInput,transport:'stdio',workspace_id:'other-project',executable:process.execPath,argv:[]})).status,400);
    const mcp=await request(a+'/mcp','POST',mcpInput);assert.equal(mcp.status,200,JSON.stringify(mcp.body));
    const mcpId=(await request(a+'/state')).body.mcp[0].id;
    assert.equal((await request(b+'/mcp/'+mcpId+'/control','POST',{action:'connect'})).status,400);
    assert.deepEqual((await request(b+'/state')).body.mcp,[]);
    const installed=await request(a+'/methods/install','POST',{candidate_id:candidate.candidate_id});
    assert.equal(installed.status,200,JSON.stringify(installed.body));
    const methodPath='/methods/'+installed.body.method.skill_id+'/1';
    assert.equal((await request(b+methodPath)).status,400);
    await close();await start();
    assert.match((await request(a+methodPath)).body.method.body,/Read the requested file/);
    const restoredMcp=(await request(a+"/state")).body.mcp[0];assert.equal(restoredMcp.id,mcpId);assert.equal(restoredMcp.health,"disconnected");assert.equal(restoredMcp.endpoint,mcpInput.endpoint);
    const reopened=await request(a+'/sessions/'+session);
    assert.equal(reopened.status,200);assert.equal(reopened.body.draft,draft);assert.deepEqual(reopened.body.runs,[]);
    assert.deepEqual(reopened.body.question_drafts,question_drafts);
    assert.deepEqual(reopened.body.configuration,configuration);
    assert.deepEqual(reopened.body.mcp_sources,[{server:"docs-service",configuration_version:3}]);
    assert.deepEqual(reopened.body.mcp_tools,[{server:"retained-server",tool:"retained-tool",version:"schema-1",configuration_version:2}]);
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{configuration:{...configuration,intent:'invented'}})).status,400);
    const second=await request(a+'/sessions','POST',{title:'独立配置'});
    assert.equal((await request(a+'/sessions/'+second.body.session.session_id)).body.configuration,null);
    assert.deepEqual(reopened.body.methods,[{skill_id:'coding-review-change',version:1}]);
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{methods:[{skill_id:'bad',version:0}]})).status,400);
    const methods=(await request(a+'/state')).body.methods;
    assert.equal(methods.length,5);
    const document=await request(a+'/methods/coding-review-change/1');
    assert.equal(document.status,200);assert.match(document.body.method.body,/不要修改文件/);
    assert.equal((await request(a+'/methods/coding-review-change/99')).status,400);
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{title:'继续检查'})).status,200);
    assert.equal((await request(a+'/state')).body.sessions.find((item:any)=>item.session_id===session).title,'继续检查');
  } finally {
    if(server!?.listening) await close();
    await rm(root,{recursive:true,force:true});
  }
});
