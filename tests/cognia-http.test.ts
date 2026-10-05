import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { assembleMcpCatalog } from "../apps/local-host/src/mcp-catalog.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { COGNIA_ACTION_PERMISSIONS, cogniaActions } from "@molis-ai/molis-work-plugin-cognia";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { randomUUID } from "node:crypto";
import { authorizeLocalWebRequest, type LocalMutationState } from "../apps/local-host/src/web-http.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleCogniaNativePluginHttp } from "../apps/local-host/src/cognia-native-plugin-http.js";
import { BUILTIN_PLUGIN_CATALOG } from "../apps/workbench/src/plugin-catalog.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/src/plugin-workbench.js";
import { COGNIA_PLUGIN_ID } from "../plugins/native/cognia/src/index.js";
import { PERSONAL_HOME_SQLITE_STORES } from "../packages/storage/src/home-sqlite.js";

test("HTTP preview/commit roundtrip, concurrent retry, malformed JSON, downloads and missing model", async t => {
  const home = await mkdtemp(join(tmpdir(), "cognia-http-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const bound = (transport: { signal: AbortSignal }) => bindActionClient(host.homeActionClient(), () => ({ actor_id: "http-test", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS, ...transport }));
  const mutationKeys = new Map<string, LocalMutationState>();
  const server = createServer((request, response) => { if (!authorizeLocalWebRequest(request, response, new URL(request.url!, "http://127.0.0.1"), "cognia-test-control", mutationKeys)) return; void handleCogniaNativePluginHttp(request,response,new URL(request.url!,"http://127.0.0.1"),bound).then(handled=>{if(!handled){response.writeHead(404);response.end();}}).catch(error=>{response.writeHead(500);response.end(String(error));}); });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await host.close();await rm(home,{recursive:true,force:true});});
  const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`, url=origin+'/api/plugins/cognia';
  const headers = () => ({'content-type':'application/json',origin,'x-molis-work-control-token':'cognia-test-control','x-molis-work-idempotency-key':randomUUID()});
  const post=(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers:headers(),body:JSON.stringify(body)});
  assert.equal((await fetch(url+'/import/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'/etc',kind:'markdown'})})).status,403);
  assert.equal((await fetch(url+'/import/preview',{method:'POST',headers:{...headers(),origin:'https://example.com'},body:'{}'})).status,403);
  const state=await(await fetch(url)).json();assert.deepEqual(state.materials,[]);assert.equal(state.ai_available,false);
  const body='---\ntags: [test]\n---\n# Original\n<script>globalThis.executed=true</script>';
  const preview=await(await post('/import/preview',{kind:'obsidian',name:'folder',files:[{path:'note.md',data:Buffer.from(body).toString('base64')},{path:'active.svg',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}]})).json();
  assert.equal(preview.preview.entries.length,2);assert.equal((await(await fetch(url)).json()).materials.length,0);
  const [a,b]=await Promise.all([post('/import/commit',{preview_id:preview.preview.id}),post('/import/commit',{preview_id:preview.preview.id})]);assert.deepEqual(await a.json(),await b.json());
  const materials=(await(await fetch(url)).json()).materials;assert.equal(materials.length,2);assert.ok(materials.every((m:Record<string,unknown>)=>!('body'in m)));
  const material=materials.find((m:{path:string})=>m.path==='note.md'),attachment=materials.find((m:{path:string})=>m.path==='active.svg');
  assert.equal((await(await fetch(url+'/materials/'+material.id)).json()).material.body,body);
  const download=await fetch(url+'/materials/'+attachment.id+'/download');assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition')!,/^attachment;/);assert.equal(download.headers.get('content-security-policy'),'sandbox');assert.equal(await download.text(),'<svg onload="alert(1)"></svg>');
  assert.equal((await fetch(url+'/import/preview?path=/etc')).status,404);
  assert.equal((await fetch(url+'/domains',{method:'POST',headers:headers(),body:'{invalid'})).status,400);
  assert.equal((await post('/domains',null)).status,400);assert.equal((await post('/import/preview',{kind:'markdown',name:'x',files:[{path:'../x.md',data:'eA=='}]})).status,400);
  const noModel=await post('/ai',{mode:'synthesize',material_ids:[material.id]});assert.equal(noModel.status,503);assert.match((await noModel.json()).error,/尚未配置/);
  assert.equal((await(await fetch(url+'?q=Original')).json()).materials.length,1);
});

test("Cognia registers as personal workspace, Home cleanup and read-only Home actions",async()=>{
  const entry=BUILTIN_PLUGIN_CATALOG.find(e=>e.project_plugin_id==='cognia');assert.equal(entry?.personal,true);assert.equal(entry?.manifest.plugin_id,COGNIA_PLUGIN_ID);assert.ok(BUILTIN_PLUGIN_WORKBENCH.some(e=>e.project_plugin_id==='cognia'));assert.ok(PERSONAL_HOME_SQLITE_STORES.includes('cognia'));
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

test("Cognia action tools run as Home actions without project binding and disappear when the grant is revoked", async () => {
  const { MolisWorkServer } = await import("../apps/desktop/launchers/mcp/server.js");
  const home = await mkdtemp(join(tmpdir(), "cognia-mcp-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const owner = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS }));
  const server = new MolisWorkServer("runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "cognia-mcp-test", host_declares_stable: true }, webBaseUrl: "http://127.0.0.1:4173" });
  const name = hostActionToolName(cogniaActions.search), readName = hostActionToolName(cogniaActions.read);
  const list = async () => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) as any).result.tools.map((tool: { name: string }) => tool.name);
  const call = async (tool: string, args: object) => (await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }) as any).result;
  try {
    assert.ok(!(await list()).includes(name));
    const { material } = await owner.invoke(cogniaActions.createMaterial, { title: "Shared", body: "Actual Home evidence" });
    const views = await host.inspectActions({ actor_id: "runtime:codex", project_id: null, audience: "mcp", permissions: [] });
    const grant = (action: typeof cogniaActions.search | typeof cogniaActions.read, enabled: boolean) =>
      writeMcpActionGrant(home, createMcpActionGrant("runtime:codex", null, views.find(view => view.capability_id === action.capability_id)!, enabled));
    await grant(cogniaActions.search, true); await grant(cogniaActions.read, true);
    assert.ok((await list()).includes(name));
    const searched = await call(name, { query: "Actual Home" }); assert.equal(searched.isError, false, JSON.stringify(searched));
    assert.equal(JSON.parse(searched.content[0].text).materials[0].id, material.id);
    const read = await call(readName, { id: material.id, revision: 1 }); assert.equal(read.isError, false, JSON.stringify(read));
    assert.equal(JSON.parse(read.content[0].text).material.body, "Actual Home evidence");
    await grant(cogniaActions.search, false);
    assert.ok(!(await list()).includes(name));
    const denied = await call(name, { query: "Actual Home" }); assert.equal(denied.isError, true); assert.doesNotMatch(denied.content[0].text, /Actual Home evidence/);
  } finally { await server.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
