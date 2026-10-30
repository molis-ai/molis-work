import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
test('Images standard MCP generates and retrieves real bytes, then preserves them across process restart',{timeout:45_000},async()=>{
  const home=await mkdtemp(join(tmpdir(),'images-mcp-')),clients:Client[]=[];let calls=0;
  const provider=createServer(async(req,res)=>{for await(const _ of req){};calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:PNG}]}));});
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));const address=provider.address();assert.ok(address&&typeof address==='object');
  const connect=async(project:string,access='write')=>{const client=new Client({name:'external-images',version:'1'});clients.push(client);
    const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',fileURLToPath(new URL('./fixtures/images-mcp-server.ts',import.meta.url)),home,project,access],stderr:'pipe'});
    let errors='';transport.stderr?.on('data',data=>{errors+=String(data);});try{await client.connect(transport);}catch(error){throw new Error(`${String(error)}\n${errors}`);}return client;};
  const call=async(client:Client,name:string,args:Record<string,unknown>={})=>{const result=await client.callTool({name:`images.${name}__v${name==='jobs.start'?3:name==='connections.list'||name==='jobs.delete'?2:1}`,arguments:args});assert.equal(result.isError,false,JSON.stringify(result));return result.structuredContent as any;};
  try{
    const client=await connect('a');const names=(await client.listTools()).tools.map(tool=>tool.name).filter(name=>name.startsWith('images.'));
    // Includes the connection usage query; generating is not offered until a service exists to generate with.
    assert.equal(names.length,11);assert.ok(!names.includes('images.jobs.start__v1'));assert.ok(!names.includes('images.jobs.start__v2'));assert.ok(!names.includes('images.jobs.start__v3'));assert.equal(calls,0);
    assert.ok(names.includes('images.connection.usages__v1'));
    assert.ok(names.includes('images.connections.list__v2'));assert.equal((await client.callTool({name:'images.connections.list__v1',arguments:{}})).isError,true, 'the superseded connection contract cannot be invoked');
    const {connection}=await call(client,'connections.save',{name:'MCP provider',api_format:'openai-images',base_url:`http://127.0.0.1:${address.port}/v1`,model:'fixture-image'});
    const configured=(await client.listTools()).tools.map(tool=>tool.name).filter(name=>name.startsWith('images.'));
    assert.equal(configured.length,12,'the saved service makes generating available');assert.ok(configured.includes('images.jobs.start__v3'));assert.ok(!configured.includes('images.jobs.start__v2'));assert.ok(!configured.includes('images.jobs.start__v1'));
    assert.equal((await client.callTool({name:'images.jobs.start__v1',arguments:{}})).isError,true,'the superseded generation contract cannot be invoked');
    // ASC-10: an unauthenticated image configuration is not itself an account connection.
    assert.deepEqual(await call(client,'connection.usages',{connection_id:connection.id}),{usages:[]});
    assert.equal((await call(client,'connections.list')).connections[0].id,connection.id);
    const input={request_id:'same-click',connection_id:connection.id,prompt:'MCP image'};
    const {job}=await call(client,'jobs.start',input);assert.equal((await call(client,'jobs.start',input)).job.id,job.id);
    let completed;const deadline=Date.now()+5000;
    do{completed=(await call(client,'jobs.get',{id:job.id})).job;if(completed.status==='running')await new Promise(resolve=>setTimeout(resolve,15));}while(completed.status==='running'&&Date.now()<deadline);
    assert.equal(completed.status,'succeeded');assert.equal(calls,1);
    const image=await call(client,'images.read',{id:job.id,image_id:completed.images[0].id});assert.deepEqual(Buffer.from(image.base64,'base64'),Buffer.from(PNG,'base64'));
    await client.close();const other=await connect('b');assert.deepEqual((await call(other,'jobs.list')).jobs,[]);
    assert.equal((await other.callTool({name:'images.jobs.get__v1',arguments:{id:job.id}})).isError,true);await other.close();
    const reader=await connect('a','read');assert.equal((await reader.callTool({name:'images.jobs.start__v3',arguments:input})).isError,true);
    assert.deepEqual(await call(reader,'images.read',{id:job.id,image_id:completed.images[0].id}),image);await reader.close();
    const restarted=await connect('a');assert.equal((await call(restarted,'jobs.start',input)).job.id,job.id);assert.equal(calls,1);
    await call(restarted,'jobs.delete',{id:job.id});await call(restarted,'connections.delete',{id:connection.id});assert.deepEqual((await call(restarted,'jobs.list')).jobs,[]);
  }finally{await Promise.all(clients.map(client=>client.close()));provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()));await rm(home,{recursive:true,force:true});}
});
