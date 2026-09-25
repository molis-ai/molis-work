import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pptActions as actions, PPT_ACTION_PERMISSIONS, openPptStore, runPptMcpTool } from "@molis-ai/molis-work-plugin-ppt";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "ppt-actions-")), host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "legacy-board", projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: ref.board_id, title: "PPT", actor_id: "owner", idempotency_key: "init" }));
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PPT_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  return { home, host, ref, caller, client, bound };
}
const slides = [{ id: "opening", title: "开场", bullets: ["一季度结果", "下一步"], notes: "讲者备注\n保留第二行", order: 1 },
  { id: "next", title: "后续计划", bullets: ["试用"], notes: "", order: 2 }];

test("PPT all actions and six legacy tools share records, typed slides, colors and export", async t => {
  const f = await fixture(t);
  const legacy = async (tool_id: string, args = {}) => JSON.parse(await runPptMcpTool(f.bound, { tool_id, arguments: args }));
  const catalog = await f.bound.discover();
  for (const action of Object.values(actions)) assert.ok(catalog.some(item => item.capability_id === action.capability_id));
  let { presentation } = await legacy("create", { title: "季度演示" }); const id = presentation.id;
  assert.equal((await legacy("list")).presentations[0].id,id);
  assert.equal(presentation.slides.length,1);
  await assert.rejects(f.client.invoke({ ...f.caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["ppt:read"] }, actions.create, {}), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
  presentation = (await legacy("update", { id, slides, color_primary: "#B34D32", color_background: "#FCFCFB", color_text: "#292A2E", expected_version: presentation.version })).presentation;
  assert.deepEqual(presentation.slides,slides); assert.equal(presentation.color_primary,"#b34d32");
  const originalVersion=presentation.version;
  for (const patch of [{color_primary:"red"},{slides:[]},{slides:[{id:"same"},{id:"same"}]},{slides:[{bullets:[3]}]}]) {
    await assert.rejects(f.bound.invoke(actions.update,{id,...patch} as never));
    assert.equal((await legacy("get",{id})).presentation.version,originalVersion);
  }
  for(const action of [actions.update,actions.export,actions.delete,actions.promote]) await assert.rejects(f.bound.invoke(action,{id,expected_version:1}),{code:"ppt.conflict"});
  const exported=await f.bound.invoke(actions.export,{id,expected_version:originalVersion});
  assert.equal(exported.filename,'季度演示.json');assert.equal(exported.mime_type,'application/json');assert.deepEqual(JSON.parse(exported.content),presentation);
  const published=await legacy("promote",{id,expected_version:originalVersion});
  await f.host.withProject(f.ref,runtime=>assert.deepEqual((runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id,published.artifact)!.payload as any).slides,slides));
  const store=openPptStore(f.home);let foreign:string;
  try{foreign=store.create({project_id:'b'}).id;}finally{store.close();}
  for(const action of [actions.get,actions.export,actions.delete])await assert.rejects(f.bound.invoke(action,{id:foreign}),{code:'ppt.not_found'});
  await f.host.closeProject(f.ref); assert.deepEqual((await legacy('get',{id})).presentation,published.presentation);
  await legacy('delete',{id,expected_version:published.presentation.version}); assert.deepEqual((await legacy('list')).presentations,[]);
  const another=await fixture(t);assert.deepEqual((await another.bound.invoke(actions.list,{})).presentations,[]);
});

test("PPT opens original schema without rewriting slides, colors or artifact references",async t=>{
  const f=await fixture(t),db=openHomeSqliteDatabase(f.home,'ppt');
  try{
    db.exec(`CREATE TABLE presentations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
      color_primary TEXT NOT NULL,color_background TEXT NOT NULL,color_text TEXT NOT NULL,slides_json TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL,artifact_id TEXT NOT NULL,artifact_version INTEGER NOT NULL)`);
    db.prepare('INSERT INTO presentations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('old','a','旧演示','旧说明','#123456','#FFFFFF','#000000',JSON.stringify(slides),'2025-01-01','2025-01-02',8,'ppt-old',3);
    const record=(await f.bound.invoke(actions.get,{id:'old'})).presentation;
    assert.deepEqual(record.slides,slides);assert.equal(record.color_background,'#FFFFFF');assert.equal(record.version,8);assert.equal(record.artifact_version,3);
    assert.equal(record.created_at,'2025-01-01');assert.equal(record.publication_pending,undefined);
    assert.deepEqual(JSON.parse((await f.bound.invoke(actions.export,{id:'old'})).content),record);
    const changed=(await f.bound.invoke(actions.update,{id:'old',description:'新说明',expected_version:8})).presentation;
    assert.deepEqual(changed.slides,slides);assert.equal(changed.artifact_id,'ppt-old');assert.equal(changed.artifact_version,3);
  }finally{db.close();}
});

test("PPT fixed publication survives partial success, actor isolation, restart and later edits",async t=>{
  const f=await fixture(t);const {presentation}=await f.bound.invoke(actions.create,{title:'Original snapshot'});
  const id=presentation.id,db=openHomeSqliteDatabase(f.home,'ppt');
  try{
    db.exec("CREATE TRIGGER fail_ppt BEFORE UPDATE OF artifact_version ON presentations WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failure'); END");
    await assert.rejects(f.bound.invoke(actions.promote,{id}),/fixture association failure/);
    assert.equal((await f.bound.invoke(actions.get,{id})).presentation.publication_pending!.version,1);
    await assert.rejects(f.bound.invoke(actions.delete,{id}),{code:'ppt.publication_pending'});
    await f.bound.invoke(actions.update,{id,title:'Later edit',slides});
    await assert.rejects(f.client.invoke({...f.caller,actor_id:'other'},actions.promote,{id}),{code:'ppt.publication_owner'});
    db.exec('DROP TRIGGER fail_ppt');
  }finally{db.close();}
  await f.host.closeProject(f.ref);
  const restored=await f.bound.invoke(actions.promote,{id});
  assert.equal(restored.recovered,true);assert.equal(restored.artifact.version,1);assert.equal(restored.presentation.title,'Later edit');assert.deepEqual(restored.presentation.slides,slides);
  await f.host.withProject(f.ref,runtime=>{
    const original=runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id,restored.artifact)!;
    assert.equal((original.payload as any).title,'Original snapshot');assert.equal((original.payload as any).slides.length,1);
    assert.equal(runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id,{...restored.artifact,version:2}),null);
  });
  const next=await f.bound.invoke(actions.promote,{id});assert.equal(next.artifact.version,2);
  await f.host.withProject(f.ref,runtime=>assert.deepEqual((runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id,next.artifact)!.payload as any).slides,slides));
});
