import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PPT_ACTION_PERMISSIONS, PPT_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-plugin-ppt";
import { openPptStore } from "./fixtures/plugin-home-stores.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { LocalProjectDatabase, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";
import { residentMcpGrants } from "./fixtures/resident-mcp-grants.js";

// RAC-105-A-16: every MCP client starts a forwarding process, which takes several seconds on a loaded Linux CI runner (30–45 s for the
// whole test at two files at once): the budget only stops a hang, it is not a speed check.
test("PPT standard MCP shares exports, concurrent edits and fixed publication across processes",{timeout:120_000},async t=>{
  const resident=await openTestHome(t),home=resident.home,clients:Client[]=[];
  const projects={a:await resident.createProject('PPT A',[PPT_PROJECT_PLUGIN_ID]),b:await resident.createProject('PPT B',[PPT_PROJECT_PLUGIN_ID])};
  const grant=residentMcpGrants();
  const connect=async(project:string,access='write')=>{
    const ref=projects[project as keyof typeof projects],actor=`runtime:fixture-${access}`;
    const permissions=access==='read'?['ppt:read']:PPT_ACTION_PERMISSIONS.filter(permission=>permission!=='model:invoke');
    await grant(resident,ref.project_id,actor,'ppt',permissions);
    const client=new Client({name:'external-ppt',version:'1'});clients.push(client);
    const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',fileURLToPath(new URL('./fixtures/ppt-mcp-server.ts',import.meta.url)),home,ref.project_id,`fixture-${access}`,ref.database_path,resident.origin],stderr:'pipe'});
    let errors='';transport.stderr?.on('data',data=>{errors+=String(data);});
    try{await client.connect(transport);}catch(error){throw new Error(`${String(error)}\n${errors}`);}return client;
  };
  // W4-6-07: a tool is named by its capability version, and `content.receive` is at version 2; the other tools keep `__v1`.
  const tool=(name:string)=>molisWorkActionToolName({capability_id:`ppt.${name}`,version:name==='content.receive'||name==='subject.read'?2:1});
  const call=async(client:Client,name:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name:tool(name),arguments:args});assert.equal(result.isError,false,JSON.stringify(result));return result.structuredContent as any;
  };
  try{
    const writer=await connect('a'),reader=await connect('a','read'),other=await connect('b'),secondWriter=await connect('a');
    assert.deepEqual((await writer.listTools()).tools.map(t=>t.name).filter(n=>n.startsWith('molis_work_v1_action_ppt.')).sort(),['list','get','create','update','delete','export','pptx','promote','artifacts.pin','outline','outline_pages','search.entries','subject.read','content.list','content.read','content.receive','content.create'].map(tool).sort());
    let {presentation}=await call(writer,'create',{title:'MCP 演示'});const id=presentation.id;
    assert.deepEqual((await call(other,'list')).presentations,[]);
    for(const [client,name,args] of [[other,'get',{id}],[reader,'update',{id,title:'denied'}],[writer,'create',{project_id:'b'}]] as const)assert.equal((await client.callTool({name:tool(name),arguments:args})).isError,true);
    const edits=await Promise.all([writer,secondWriter].map((client,index)=>client.callTool({name:tool('update'),arguments:{id,title:`Writer ${index}`,expected_version:presentation.version}})));
    assert.equal(edits.filter(result=>!result.isError).length,1);assert.equal(edits.filter(result=>result.isError).length,1);
    presentation=(await call(reader,'get',{id})).presentation;assert.equal(presentation.version,2);
    assert.deepEqual(JSON.parse((await call(reader,'export',{id,expected_version:2})).content),presentation);
    const snapshotTitle=presentation.title;
    const db=openHomeSqliteDatabase(home,'ppt');
    try{
      db.exec("CREATE TRIGGER fail_ppt_mcp BEFORE UPDATE OF artifact_version ON presentations WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      assert.equal((await writer.callTool({name:tool('promote'),arguments:{id,expected_version:presentation.version}})).isError,true);
      assert.equal((await call(reader,'get',{id})).presentation.publication_pending.version,1);
      const current=(await call(reader,'get',{id})).presentation;
      presentation=(await call(writer,'update',{id,expected_version:current.version,title:'Later edit',slides:[{id:'original-slide',title:'保留页',bullets:['真实内容'],notes:'两行\n备注'}]})).presentation;
      db.exec('DROP TRIGGER fail_ppt_mcp');
    }finally{db.close();}
    await writer.close();await secondWriter.close();const restarted=await connect('a');
    const recovered=await call(restarted,'promote',{id,expected_version:presentation.version});
    assert.equal(recovered.recovered,true);assert.equal(recovered.artifact.version,1);assert.equal(recovered.presentation.title,'Later edit');
    const project=new LocalProjectDatabase(projects.a.database_path);
    try{const library=openProjectVersionStores(project);assert.equal((library.artifacts.query.getArtifactVersion(projects.a.project_id,recovered.artifact)!.payload as any).title,snapshotTitle);
      assert.equal(library.artifacts.query.getArtifactVersion(projects.a.project_id,{...recovered.artifact,version:2}),null);
    }finally{project.close();}
    const store=openPptStore(home);try{assert.deepEqual(store.get(id,projects.a.project_id),recovered.presentation);}finally{store.close();}
    const exported=await call(reader,'export',{id});assert.deepEqual(JSON.parse(exported.content),recovered.presentation);
    await call(restarted,'delete',{id,expected_version:recovered.presentation.version});assert.deepEqual((await call(reader,'list')).presentations,[]);
  }finally{await Promise.all(clients.map(client=>client.close()));}
});
