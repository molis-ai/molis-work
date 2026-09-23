import { randomUUID } from "node:crypto";
import { authorizeLocalWebRequest, type LocalMutationState } from "../apps/local-host/src/web-http.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handlePersonalNativePluginHttp } from "../apps/local-host/src/personal-native-plugin-http.js";
import { NATIVE_MCP_PLUGIN_REGISTRATIONS } from "../apps/local-host/src/mcp-native-plugins.js";
import { BUILTIN_PLUGIN_CATALOG } from "../apps/workbench/src/plugin-catalog.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/src/plugin-workbench.js";
import { openCogniaStore, runCogniaMcpTool, COGNIA_PLUGIN_ID } from "../plugins/native/cognia/src/index.js";
import { PERSONAL_HOME_SQLITE_STORES } from "../packages/storage/src/home-sqlite.js";

test("HTTP preview/commit roundtrip, concurrent retry, malformed JSON, downloads and missing model", async t => {
  const home = await mkdtemp(join(tmpdir(), "cognia-http-"));
  const mutationKeys = new Map<string, LocalMutationState>();
  const server = createServer((request, response) => { if (!authorizeLocalWebRequest(request, response, new URL(request.url!, "http://127.0.0.1"), "cognia-test-control", mutationKeys)) return; void handlePersonalNativePluginHttp(request,response,new URL(request.url!,"http://127.0.0.1"),home).then(handled=>{if(!handled){response.writeHead(404);response.end();}}).catch(error=>{response.writeHead(500);response.end(String(error));}); });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(home,{recursive:true,force:true});});
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

test("Cognia registers as personal workspace, Home cleanup and opt-in read-only MCP",async()=>{
  const entry=BUILTIN_PLUGIN_CATALOG.find(e=>e.project_plugin_id==='cognia');assert.equal(entry?.personal,true);assert.equal(entry?.manifest.plugin_id,COGNIA_PLUGIN_ID);assert.ok(BUILTIN_PLUGIN_WORKBENCH.some(e=>e.project_plugin_id==='cognia'));assert.ok(PERSONAL_HOME_SQLITE_STORES.includes('cognia'));
  const registration=NATIVE_MCP_PLUGIN_REGISTRATIONS.find(e=>e.source.project_plugin_id==='cognia');assert.equal(registration?.default_enabled,false);assert.ok(registration?.source.exports.every(e=>e.effect==='read'&&e.scope==='home'));assert.deepEqual(registration?.source.exports.map(e=>e.tool_id),['search','read']);
  const home=await mkdtemp(join(tmpdir(),'cognia-mcp-')),store=openCogniaStore(home);try{const material=store.createMaterial({title:'Reference',body:'Exact body'});const found=JSON.parse(runCogniaMcpTool(store,{tool_id:'search',arguments:{query:'Exact'}}));assert.equal(found.materials[0].id,material.id);assert.equal(JSON.parse(runCogniaMcpTool(store,{tool_id:'read',arguments:{id:material.id,revision:1}})).material.body,'Exact body');assert.throws(()=>runCogniaMcpTool(store,{tool_id:'read',arguments:{id:'/etc/passwd'}}),/不存在/);assert.throws(()=>runCogniaMcpTool(store,{tool_id:'write',arguments:{}}),/未知/);}finally{store.close();await rm(home,{recursive:true,force:true});}
});
