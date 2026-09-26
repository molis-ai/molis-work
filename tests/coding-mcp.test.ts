import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";

export const MCP_FIXTURE = `import {createInterface} from 'node:readline';
const tools=[{name:'record_review_note',description:'Record a reviewed note in this test workspace.',inputSchema:{type:'object',properties:{note:{type:'string'}},required:['note'],additionalProperties:false}}];
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'coding-fixture',version:'1.0.0'}};
else if(m.method==='tools/list')result={tools};
else if(m.method==='tools/call'){const {appendFile}=await import('node:fs/promises');await appendFile('mcp-notes.jsonl',JSON.stringify(m.params.arguments)+'\\n');result={content:[{type:'text',text:'Saved one note: '+m.params.arguments.note}]};}
else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Not supported'}})+'\\n');continue;}
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}
`;

test("MCP real stdio handshake, version selection, revocation and persisted config keep project ownership", async()=>{
  const root=await mkdtemp(join(tmpdir(),'molis-mcp-'));
  const owner={board_id:'a',plugin_id:'io.molis.work.coding'}, other={...owner,board_id:'b'};
  const open=()=>createPrologueNodeAdapter({app:{appId:'io.molis.mcp-test',appVersion:'1.0.0'},reviewQueue:new AgentReviewQueue(),storageRoot:join(root,'runtime'),modelConfiguration:async()=>null,resolveCredential:()=>null});
  let adapter:Awaited<ReturnType<typeof open>>|undefined;
  try{
    await writeFile(join(root,'server.mjs'),MCP_FIXTURE);adapter=await open();let library=adapter.mcpLibrary!;
    const input={expected_version:0,label:'Local MCP',transport:'stdio' as const,enabled:true,timeout_ms:5000,directory:{canonical_path:root,realpath_verified:true},executable:process.execPath,argv:['server.mjs']};
    const saved=await library.save(owner,input);assert.equal(saved.version,1);assert.equal(saved.health,'disconnected');
    await assert.rejects(library.control(other,saved.id,'connect'),/当前项目/);
    await library.control(owner,saved.id,'connect');const connected=(await library.list(owner))[0]!;
    assert.equal(connected.health,'connected');assert.equal(connected.tools.length,1);assert.ok(connected.tools[0]!.version);
    await library.validate(owner,connected.tools);
    const source={server:saved.id,configuration_version:1};
    assert.equal((await library.validateSources(owner,[source]))[0]?.server_label,'Local MCP');
    await assert.rejects(library.validateSources(other,[source]));
    await assert.rejects(library.validateSources(owner,[{...source,configuration_version:99}]),/版本/);
    await assert.rejects(library.validate(other,connected.tools));
    await assert.rejects(library.validate(owner,[{...connected.tools[0]!,version:'old-shape'}]),/形状版本/);
    await assert.rejects(library.save(owner,{...input,id:saved.id,expected_version:0}),/配置已变化/);
    await library.control(owner,saved.id,'disconnect');await assert.rejects(library.validate(owner,connected.tools),/断开/);await assert.rejects(library.validateSources(owner,[source]),/断开/);
    await writeFile(join(root,'server.mjs'),MCP_FIXTURE.replace("note:{type:'string'}","note:{type:'string'},category:{type:'string'}"));
    await library.control(owner,saved.id,'connect');
    await assert.rejects(library.validate(owner,connected.tools),/形状版本/);
    await library.control(owner,saved.id,'disconnect');
    await library.save(owner,{...input,id:saved.id,expected_version:1,enabled:false});
    await assert.rejects(library.control(owner,saved.id,'connect'),/启用/);
    await adapter.close();adapter=await open();library=adapter.mcpLibrary!;
    const restored=(await library.list(owner))[0]!;assert.equal(restored.version,2);assert.equal(restored.enabled,false);assert.equal(restored.health,'disconnected');
    await assert.rejects(library.validate(owner,connected.tools),/配置版本/);assert.deepEqual(await library.list(other),[]);
    await library.control(owner,saved.id,'remove');assert.deepEqual(await library.list(owner),[]);
    await assert.rejects(library.save(owner,{...input,transport:'http',endpoint:'https://user:secret@example.com/mcp',auth:{kind:'none'}}),/地址不能包含凭据/);
  }finally{await adapter?.close();await rm(root,{recursive:true,force:true});}
});


test("MCP HTTP credentials stay outside views; config identity, cancellation and timeout invalidate old selections", async()=>{
  const root=await mkdtemp(join(tmpdir(),'molis-mcp-http-'));
  const owner={board_id:'http-project',plugin_id:'io.molis.work.coding'};
  const secret='mcp-test-only-credential-123456789';
  const authSeen:boolean[]=[];let initialized=0;
  const server=createServer(async(request,response)=>{
    if(request.url==='/hang'){initialized++;return;}
    authSeen.push(request.headers.authorization==='Bearer '+secret);
    if(request.method==='DELETE'){response.writeHead(204).end();return;}
    const parts:Buffer[]=[];for await(const part of request)parts.push(Buffer.from(part));
    const message=JSON.parse(Buffer.concat(parts).toString());
    if(message.id===undefined){response.writeHead(202).end();return;}
    const result=message.method==='initialize'?{protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'http-fixture',version:'1'}}:{tools:[{name:'read_note',inputSchema:{type:'object',properties:{}}}]};
    response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address==='object');
  const endpoint='http://127.0.0.1:'+address.port+'/mcp';
  let adapter:Awaited<ReturnType<typeof createPrologueNodeAdapter>>|undefined;
  try{
    adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.mcp-http-test',appVersion:'1.0.0'},reviewQueue:new AgentReviewQueue(),storageRoot:join(root,'runtime'),modelConfiguration:async()=>null,resolveCredential:()=>null});
    const library=adapter.mcpLibrary!;
    const input={expected_version:0,label:'Authenticated HTTP',transport:'http' as const,enabled:true,timeout_ms:1000,endpoint,auth:{kind:'replace-secret' as const,secret}};
    const saved=await library.save(owner,input);assert.equal(saved.credential,'present');assert.ok(!JSON.stringify(saved).includes(secret));
    await library.control(owner,saved.id,'connect');
    const first=(await library.list(owner))[0]!;assert.equal(first.health,'connected');assert.ok(authSeen.length>=2 && authSeen.every(Boolean));
    assert.equal(first.tools[0]!.configuration_version,1);
    await assert.rejects(library.save(owner,{...input,id:saved.id,expected_version:1,endpoint:endpoint+'-changed',auth:{kind:'keep-existing'}}),/地址变化/);
    // Same shape at a replacement endpoint is not the same selected capability.
    await library.save(owner,{...input,id:saved.id,expected_version:1,endpoint:endpoint+'-changed'});
    await library.control(owner,saved.id,'connect');
    const second=(await library.list(owner))[0]!;assert.equal(second.tools[0]!.version,first.tools[0]!.version);assert.equal(second.tools[0]!.configuration_version,2);
    await assert.rejects(library.validate(owner,first.tools),/配置版本/);await library.validate(owner,second.tools);
    assert.ok(!JSON.stringify(await library.list(owner)).includes(secret));
    const hanging=await library.save(owner,{...input,endpoint:endpoint.replace('/mcp','/hang'),auth:{kind:'none'},timeout_ms:5000});
    const connecting=library.control(owner,hanging.id,'connect');const failed=assert.rejects(connecting);
    while(initialized===0)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal((await library.list(owner)).find(item=>item.id===hanging.id)?.busy,'connect');
    await library.control(owner,hanging.id,'cancel');await failed;
    assert.notEqual((await library.list(owner)).find(item=>item.id===hanging.id)?.health,'connected');
    await library.save(owner,{...input,id:hanging.id,expected_version:1,endpoint:endpoint.replace('/mcp','/hang'),auth:{kind:'none'},timeout_ms:1000});
    await assert.rejects(library.control(owner,hanging.id,'connect'));
    assert.notEqual((await library.list(owner)).find(item=>item.id===hanging.id)?.health,'connected');
  }finally{await adapter?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test("MCP connection selection resolves the current Connector secret again after rotation", async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-mcp-connector-"));
  const owner = { board_id: "connector-project", plugin_id: "io.molis.work.coding" };
  const authSeen: string[] = [];
  const server = createServer(async (request, response) => {
    authSeen.push(String(request.headers.authorization ?? ""));
    if (request.method === "DELETE") { response.writeHead(204).end(); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    const message = JSON.parse(Buffer.concat(parts).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    const result = message.method === "initialize"
      ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "connector-fixture", version: "1" } }
      : { tools: [{ name: "read_note", inputSchema: { type: "object", properties: {} } }] };
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  const connectionId = "11111111-1111-4111-8111-111111111111";
  const credentialRef = `connector-connection:${connectionId}:token`;
  let token = "first-mcp-token";
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  try {
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.mcp-connector-test", appVersion: "1.0.0" },
      reviewQueue: new AgentReviewQueue(), storageRoot: join(root, "runtime"), modelConfiguration: async () => null,
      resolveMcpConnection: (id, destination) => id === connectionId && destination === endpoint ? credentialRef : null,
      resolveCredential: ref => ref === credentialRef ? token : null });
    const library = adapter.mcpLibrary!;
    const saved = await library.save(owner, { expected_version: 0, label: "选定的 MCP 账号", transport: "http", enabled: true,
      timeout_ms: 1000, endpoint, auth: { kind: "connection", connection_id: connectionId } });
    assert.equal(saved.auth_connection_id, connectionId);
    assert.equal(JSON.stringify(saved).includes(token), false);
    await library.control(owner, saved.id, "connect");
    assert.ok(authSeen.includes("Bearer first-mcp-token"));
    await library.control(owner, saved.id, "disconnect");
    token = "rotated-mcp-token";
    await library.control(owner, saved.id, "connect");
    assert.ok(authSeen.includes("Bearer rotated-mcp-token"));
    assert.equal(JSON.stringify(await library.list(owner)).includes(token), false);
  } finally {
    await adapter?.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
