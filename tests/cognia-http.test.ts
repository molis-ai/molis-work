import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { assembleMcpCatalog, homeStores } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { COGNIA_ACTION_PERMISSIONS, cogniaActions } from "@molis-ai/molis-work-plugin-cognia";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/dist/plugin-workbench.js";
import { COGNIA_PLUGIN_ID } from "@molis-ai/molis-work-plugin-cognia";
import { serveTestHost } from "./fixtures/test-home.js";

test("HTTP preview/commit roundtrip, concurrent retry, malformed JSON, downloads and missing model", async t => {
  const f = await serveHomeRuntime(t), path = "/api/plugins/io.molis.work.cognia/library";
  const url = f.origin + path;
  const post = (suffix: string, body: unknown) => f.request(path + suffix, { method: "POST", body });
  assert.equal((await f.request(path + "/import/preview", { method: "POST", authorized: false, body: { path: "/etc", kind: "markdown" } })).status, 403);
  assert.equal((await f.request(path + "/import/preview", { method: "POST", headers: { origin: "https://example.com" }, body: {} })).status, 403);
  const state = await (await fetch(url)).json(); assert.deepEqual(state.materials, []); assert.equal(state.ai_available, false);
  const project = await f.project("Old route refusal");
  const grantResponse = await f.request(`/projects/${project.project_id}/api/host/directory-grants`, { method: "POST", body: { path: f.home } });
  assert.equal(grantResponse.status, 400, "SYS-15 an absolute path supplied by a page is not authorization");
  assert.equal((await f.request(`/projects/${project.project_id}/api/cognia`)).status, 404, "RAC-40: the removed Host adapter is unavailable");
  assert.equal((await f.request("/api/cognia")).status, 400, "Home retains its shared unknown-API response");
  const body='---\ntags: [test]\n---\n# Original\n<script>globalThis.executed=true</script>';
  const preview=await(await post('/import/preview',{kind:'obsidian',name:'folder',files:[{path:'note.md',data:Buffer.from(body).toString('base64')},{path:'active.svg',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}]})).json();
  assert.equal(preview.preview.entries.length,2);assert.equal((await(await fetch(url)).json()).materials.length,0);
  const [a,b]=await Promise.all([post('/import/commit',{preview_id:preview.preview.id}),post('/import/commit',{preview_id:preview.preview.id})]);assert.deepEqual(await a.json(),await b.json());
  const materials=(await(await fetch(url)).json()).materials;assert.equal(materials.length,2);assert.ok(materials.every((m:Record<string,unknown>)=>!('body'in m)));
  const material=materials.find((m:{path:string})=>m.path==='note.md'),attachment=materials.find((m:{path:string})=>m.path==='active.svg');
  assert.equal((await(await fetch(url+'/materials/'+material.id)).json()).material.body,body);
  const download=await fetch(url+'/materials/'+attachment.id+'/download');assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition')!,/^attachment;/);assert.equal(download.headers.get('content-security-policy'),'sandbox');assert.equal(await download.text(),'<svg onload="alert(1)"></svg>');
  assert.equal((await fetch(url+'/import/preview?path=/etc')).status,404);
  assert.equal((await f.request(path + '/domains', { method: 'POST', raw: '{invalid' })).status,400);
  assert.equal((await post('/domains',null)).status,400);assert.equal((await post('/import/preview',{kind:'markdown',name:'x',files:[{path:'../x.md',data:'eA=='}]})).status,400);
  const noModel=await post('/ai',{mode:'synthesize',material_ids:[material.id]});assert.equal(noModel.status,503);const missing = await noModel.json(); assert.equal(missing.error, "请先在「模型设置」里连接文字模型"); assert.equal(missing.code, "actions.connection_required"); assert.equal(typeof missing.call_id, "string");
  assert.equal((await(await fetch(url+'?q=Original')).json()).materials.length,1);
});

test("Cognia registers as personal workspace, Home cleanup and read-only Home actions",async()=>{
  const entry=BUILTIN_PLUGIN_CATALOG.find(e=>e.project_plugin_id==='cognia');assert.equal(entry?.personal,true);assert.equal(entry?.manifest.plugin_id,COGNIA_PLUGIN_ID);assert.ok(BUILTIN_PLUGIN_WORKBENCH.some(e=>e.project_plugin_id==='cognia'));assert.equal(entry?.manifest.runtime?.scope,"home");assert.equal(homeStores().get('cognia')?.owner,COGNIA_PLUGIN_ID,'uninstall --purge-user-data reaches the Cognia store');
  for (const action of [cogniaActions.search, cogniaActions.read]) { assert.equal(action.operation, 'query'); assert.equal(action.action.scope, 'home'); }
  assert.ok(!assembleMcpCatalog({ audience: 'runtime' }).entries.some(row => row.action?.provider.plugin_id === COGNIA_PLUGIN_ID), 'no Cognia tool without a grant');
  const home = await mkdtemp(join(tmpdir(), 'cognia-mcp-')), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "mcp-test", project_id: null, audience: "mcp", permissions: COGNIA_ACTION_PERMISSIONS }));
  try {
    const { material } = await actions.invoke(cogniaActions.createMaterial, { title: 'Reference', body: 'Exact body' });
    const found = await actions.invoke(cogniaActions.search, { query: 'Exact' }); assert.equal(found.materials[0]!.id, material.id);
    assert.equal((await actions.invoke(cogniaActions.read, { id: material.id, revision: 1 })).material.body, 'Exact body');
    await assert.rejects(actions.invoke(cogniaActions.read, { id: '/etc/passwd' }), /不存在/);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Cognia action tools run as Home actions without project binding and disappear when the grant is revoked", async t => {
  const { MolisWorkServer } = await import("../apps/desktop/launchers/mcp/server.js");
  const home = await mkdtemp(join(tmpdir(), "cognia-mcp-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  // W2-10: one served Host owns this Home; MCP uses that Host's production action gateway and persisted grants.
  const served = await serveTestHost(t, { home, host });
  const owner = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS }));
  const server = new MolisWorkServer("runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "cognia-mcp-test", host_declares_stable: true }, webBaseUrl: served.origin }, host, served.origin);
  const name = molisWorkActionToolName(cogniaActions.search), readName = molisWorkActionToolName(cogniaActions.read);
  const list = async () => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) as any).result.tools.map((tool: { name: string }) => tool.name);
  const call = async (tool: string, args: object) => (await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }) as any).result;
  try {
    assert.ok(!(await list()).includes(name));
    const { material } = await owner.invoke(cogniaActions.createMaterial, { title: "Shared", body: "Actual Home evidence" });
    await served.grant("runtime:codex", null, [cogniaActions.search, cogniaActions.read]);
    assert.ok((await list()).includes(name));
    const searched = await call(name, { query: "Actual Home" }); assert.equal(searched.isError, false, JSON.stringify(searched));
    assert.equal(JSON.parse(searched.content[0].text).materials[0].id, material.id);
    const read = await call(readName, { id: material.id, revision: 1 }); assert.equal(read.isError, false, JSON.stringify(read));
    assert.equal(JSON.parse(read.content[0].text).material.body, "Actual Home evidence");
    await served.revoke("runtime:codex", null, [cogniaActions.search]);
    assert.ok(!(await list()).includes(name));
    const denied = await call(name, { query: "Actual Home" }); assert.equal(denied.isError, true); assert.doesNotMatch(denied.content[0].text, /Actual Home evidence/);
  } finally { await server.close(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
