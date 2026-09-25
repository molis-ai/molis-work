import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("PPT standard MCP shares exports, concurrent edits and fixed publication across processes",{timeout:45_000},async()=>{
  const home=await mkdtemp(join(tmpdir(),'ppt-mcp-')),clients:Client[]=[];
  const connect=async(project:string,access='write')=>{
    const client=new Client({name:'external-ppt',version:'1'});clients.push(client);
    const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',fileURLToPath(new URL('./fixtures/ppt-mcp-server.ts',import.meta.url)),home,project,access],stderr:'pipe'});
    let errors='';transport.stderr?.on('data',data=>{errors+=String(data);});
    try{await client.connect(transport);}catch(error){throw new Error(`${String(error)}\n${errors}`);}return client;
  };
  const call=async(client:Client,name:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name:`ppt.${name}__v1`,arguments:args});assert.equal(result.isError,false,JSON.stringify(result));return result.structuredContent as any;
  };
  try{
    const writer=await connect('a'),reader=await connect('a','read'),other=await connect('b'),secondWriter=await connect('a');
    assert.deepEqual((await writer.listTools()).tools.map(t=>t.name).filter(n=>n.startsWith('ppt.')).sort(),['list','get','create','update','delete','export','promote'].map(n=>`ppt.${n}__v1`).sort());
    let {presentation}=await call(writer,'create',{title:'MCP 演示'});const id=presentation.id;
    assert.deepEqual((await call(other,'list')).presentations,[]);
    for(const [client,name,args] of [[other,'get',{id}],[reader,'update',{id,title:'denied'}],[writer,'create',{project_id:'b'}]] as const)assert.equal((await client.callTool({name:`ppt.${name}__v1`,arguments:args})).isError,true);
    const edits=await Promise.all([writer,secondWriter].map((client,index)=>client.callTool({name:'ppt.update__v1',arguments:{id,title:`Writer ${index}`,expected_version:presentation.version}})));
    assert.equal(edits.filter(result=>!result.isError).length,1);assert.equal(edits.filter(result=>result.isError).length,1);
    presentation=(await call(reader,'get',{id})).presentation;assert.equal(presentation.version,2);
    assert.deepEqual(JSON.parse((await call(reader,'export',{id,expected_version:2})).content),presentation);
    const snapshotTitle=presentation.title;
    const db=openHomeSqliteDatabase(home,'ppt');
    try{
      db.exec("CREATE TRIGGER fail_ppt_mcp BEFORE UPDATE OF artifact_version ON presentations WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      assert.equal((await writer.callTool({name:'ppt.promote__v1',arguments:{id,expected_version:presentation.version}})).isError,true);
      assert.equal((await call(reader,'get',{id})).presentation.publication_pending.version,1);
      presentation=(await call(writer,'update',{id,title:'Later edit',slides:[{id:'original-slide',title:'保留页',bullets:['真实内容'],notes:'两行\n备注'}]})).presentation;
      db.exec('DROP TRIGGER fail_ppt_mcp');
    }finally{db.close();}
    await writer.close();await secondWriter.close();const restarted=await connect('a');
    const recovered=await call(restarted,'promote',{id,expected_version:presentation.version});
    assert.equal(recovered.recovered,true);assert.equal(recovered.artifact.version,1);assert.equal(recovered.presentation.title,'Later edit');
    const project=new LocalProjectDatabase(join(home,'a.sqlite'));
    try{const owner=new GoalProjectApplication(project);assert.equal((owner.artifacts.query.getArtifactVersion('a',recovered.artifact)!.payload as any).title,snapshotTitle);
      assert.equal(owner.artifacts.query.getArtifactVersion('a',{...recovered.artifact,version:2}),null);
    }finally{project.close();}
    const store=openPptStore(home);try{assert.deepEqual(store.get(id,'a'),recovered.presentation);}finally{store.close();}
    const exported=await call(reader,'export',{id});assert.deepEqual(JSON.parse(exported.content),recovered.presentation);
    await call(restarted,'delete',{id,expected_version:recovered.presentation.version});assert.deepEqual((await call(reader,'list')).presentations,[]);
  }finally{await Promise.all(clients.map(client=>client.close()));await rm(home,{recursive:true,force:true});}
});
