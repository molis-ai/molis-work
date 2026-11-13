import {openPagesStore} from "./fixtures/plugin-sync-stores.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parsePluginManifest, parsePluginSyncDeclaration, expandPluginSyncSelection } from "@molis-ai/molis-work-plugin-sdk";
import {parseSpaceSyncPolicy} from "@molis-ai/molis-work-module-sync-replication";
import { ensureStorageSpace, personalStorageSpace, homeSqlitePath } from "@molis-ai/molis-work-storage";
import {pagesManifest} from "@molis-ai/molis-work-plugin-pages";

const hasCode = (code: string) => (error: unknown) => error instanceof ActionError && error.code.endsWith(".sync_"+code.split(".")[1]);
const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), "plugin-sync-"));
  const space = personalStorageSpace("https://auth.example", "work", "alice");
  const aHome = join(root, "a"), bHome = join(root, "b");
  ensureStorageSpace(aHome, space); ensureStorageSpace(bHome, space);
  const a = openPagesStore(aHome), b = openPagesStore(bHome);
  const context = { spaceId: space.spaceId, authorize: () => {}, project: (id:string) => ({title:id}), canUploadProject: () => true, hasArtifact: () => true, hasReference: () => true };
  t.after(() => { a.close(); b.close(); rmSync(root, { recursive: true, force: true }); });
  return { a, b, aHome, bHome, root, space, context, source: a.replica(context), target: b.replica(context) };
}

test("sync declarations are optional, validated, immutable and dependency-aware", () => {
  const { sync: _, ...legacy } = pagesManifest;
  assert.equal(parsePluginManifest(legacy).sync, undefined);
  assert.equal(parsePluginManifest(pagesManifest).sync?.collections[0]?.id, "documents");
  const declaration = { protocol_version: 1 as const, collections: [
    { id: "documents", title: "文档", schema_version: 1, requires: ["attachments"] },
    { id: "attachments", title: "附件", schema_version: 1, requires: [] },
    { id: "history", title: "历史", schema_version: 1, requires: [] },
  ] };
  assert.deepEqual(expandPluginSyncSelection(declaration, ["documents"]), ["attachments", "documents"]);
  assert.deepEqual(expandPluginSyncSelection(declaration, []), []);
  assert.throws(() => expandPluginSyncSelection(declaration, ["unknown"]), hasCode("sync.invalid"));
  assert.ok(Object.isFrozen(parsePluginSyncDeclaration(declaration).collections));
  for (const sync of [null, {}, { ...declaration, collections: [] }, { ...declaration, typo: true },
    { ...declaration, collections: [declaration.collections[0]] },
    { ...declaration, collections: [declaration.collections[1], declaration.collections[1]] },
    { ...declaration, collections: [{ ...declaration.collections[0], requires: ["documents"] }] },
    { ...declaration, collections: [{ ...declaration.collections[1], schema_version: 0 }] }]) {
    assert.throws(() => parsePluginManifest({ ...legacy, sync }), /同步/);
  }
});

test("policy wire format belongs to a space and retains exact unavailable selections for repair", () => {
  const selection = { plugin_id: "io.molis.work.future", publisher_id: "author", publisher_signature: "sig",
    collection_id: "drafts", schema_version: 7 };
  const policy = { spaceId: "space_a", revision: 2, selections: [selection] };
  assert.deepEqual(parseSpaceSyncPolicy(policy, "space_a"), policy);
  assert.throws(() => parseSpaceSyncPolicy(policy, "space_b"), hasCode("sync.scope"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, userId: "alice" }, "space_a"), hasCode("sync.invalid"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, selections: [selection, { ...selection, schema_version: 8 }] }, "space_a"), hasCode("sync.invalid"));
  assert.throws(() => parseSpaceSyncPolicy({ ...policy, revision: -1 }, "space_a"), hasCode("sync.invalid"));
});

// Each delivery goes through the real Host-owned incremental journal; business readers use independent connections.
function deliver(f:ReturnType<typeof fixture>, revision=1) {
 const events=[];
 for(let event=f.source.next();event;event=f.source.next()){
  const received={...event,revision:revision++}; f.target.receive(received);events.push(received);
  assert.deepEqual(f.target.conflicts(),[]); f.source.acknowledge(event.key,event.operationId,received.revision);
 }return events;
}
test("Pages incremental records round-trip drafts, folders, embedded images and identities",t=>{
 const f=fixture(t),folder=f.a.createFolder({project_id:'project',title:'设计'});
 const page=f.a.create({project_id:'project',folder_id:folder.id,title:'草稿',starred:true,body:{type:'doc',content:[...body('未发布正文').content,{type:'image',attrs:{src:'data:image/png;base64,AAAA'}}]}});
 const events=deliver(f);assert.equal(f.b.get(page.id).title,page.title);assert.deepEqual(f.b.get(page.id).body,page.body);assert.deepEqual(f.b.getFolder(folder.id),folder);
 const version=f.b.get(page.id).version;for(const event of events)f.target.receive(event);assert.equal(f.b.get(page.id).version,version,'redelivery is idempotent');
});
test("remote edits invalidate stale editors and retain concurrent local edits as a conflict",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',title:'v1'});deliver(f);const stale=f.b.get(page.id);
 f.a.update(page.id,{title:'remote v2'});deliver(f,2);assert.ok(f.b.get(page.id).version>stale.version);assert.throws(()=>f.b.update(page.id,{title:'stale',expected_version:stale.version}),/其他窗口/);
 f.b.update(page.id,{title:'local edit'});f.a.update(page.id,{title:'remote v3'});const event=f.source.next()!;f.target.receive({...event,revision:3});assert.equal(f.target.conflicts().length,1);assert.equal(f.b.get(page.id).title,'local edit');
 assert.throws(()=>f.target.resolve(event.key,'remote',2));assert.equal(f.b.get(page.id).title,'local edit');f.target.resolve(event.key,'remote',3);assert.equal(f.b.get(page.id).title,'remote v3');
});
test("deletion preserves editor high-water marks, recovery is explicit, and reopening keeps the journal",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',title:'keep'});const [old]=deliver(f);const stale=f.b.get(page.id).version;
 f.a.delete(page.id);deliver(f,2);assert.equal(f.b.list('project').length,0);f.target.receive(old!);assert.equal(f.b.list('project').length,0,'old delivery cannot revive a deletion');
 f.target.receive({...old!,operationId:'explicit-restore',base:2,revision:3});assert.deepEqual(f.target.conflicts(),[]);assert.ok(f.b.get(page.id).version>stale);assert.throws(()=>f.b.update(page.id,{title:'stale',expected_version:stale}),/其他窗口/);
 const reopened=openPagesStore(f.bHome);try{assert.equal(reopened.replica(f.context).cursor(),f.target.cursor());assert.deepEqual(reopened.replica(f.context).counts(),f.target.counts());}finally{reopened.close();}
});
test("cross-project collisions and unbound local replicas are rejected without changing content",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',title:'source'}),event=f.source.next()!;
 const altered={...event,key:JSON.stringify(['other','document',page.id]),value:{...(event.value as object),project:{id:'other',title:'Other'}}};f.target.receive({...altered,revision:1});assert.equal(f.b.get(page.id,'other').title,'source');
 f.target.receive({...event,revision:2});assert.equal(f.target.conflicts().length,1);assert.equal(f.b.list('project').length,0);
 const local=openPagesStore(join(f.root,'local'));try{assert.throws(()=>local.replica(f.context),/空间不匹配/);}finally{local.close();}
});
test("references, unfinished publication and local-only links block without discarding content",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',goal_id:'goal-1',title:'linked'}),event=f.source.next()!;
 const waiting=f.b.replica({...f.context,hasReference:()=>false});waiting.receive({...event,revision:1});assert.equal(waiting.conflicts().length,1);assert.equal(f.b.list('project').length,0);
 f.source.acknowledge(event.key,event.operationId,1);
 const original = new DatabaseSync(homeSqlitePath(f.aHome,'pages'));
 try { original.prepare("UPDATE pages SET publication_pending_json=? WHERE id=?").run(JSON.stringify({ version: 1, source_version: page.version, goal_id: page.goal_id, actor_id: "actor" }), page.id); }
 finally { original.close(); }
 assert.throws(()=>f.source.next());f.a.delete(page.id);
 f.a.create({project_id:'project',body:{type:'doc',content:[{type:'image',attrs:{src:'blob:local-image'}}]}});assert.throws(()=>{for(let i=0;i<4;i++){const next=f.source.next();if(!next)break;f.source.acknowledge(next.key,next.operationId,2+i);}});
});
test("malformed remote records remain conflicts and never overwrite an existing draft",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',title:'a'}),event=f.source.next()!;f.b.create({project_id:'project',title:'local'});
 let revision=0;for(const patch of [{body:null},{secret:'must not transfer'},{starred:'true'},{created_at:'invalid'},{folder_id:'missing'}]){
  const value=event.value as {project:unknown;record:object};f.target.receive({...event,operationId:'bad:'+revision,revision:++revision,value:{...value,record:{...value.record,...patch}}});assert.equal(f.target.conflicts().length,1);assert.equal(f.b.list('project').length,1);assert.equal(f.b.list('project')[0]!.title,'local');
 }
});
test("authority revocation during a remote apply rolls back content and technical cursor",t=>{
 const f=fixture(t);f.a.create({project_id:'project',title:'remote'});const event=f.source.next()!;let checks=0;
 const guarded=f.b.replica({...f.context,authorize(){if(++checks>=6)throw new Error('revoked');}});checks=0;assert.throws(()=>guarded.receive({...event,revision:1}),/revoked/);assert.equal(f.b.list('project').length,0);assert.equal(f.target.cursor(),0);
});
test("business writes from another connection are tracked atomically and project deletion remains pending",t=>{
 const f=fixture(t),page=f.a.create({project_id:'project',title:'original'});deliver(f);const db=new DatabaseSync(homeSqlitePath(f.aHome,'pages'));
 try{db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE pages SET title='rolled back' WHERE id=?").run(page.id);db.exec('ROLLBACK');assert.equal(f.source.next(),null);
 db.prepare("UPDATE pages SET title='second connection',version=version+1 WHERE id=?").run(page.id);assert.ok(f.source.next());}finally{db.close();}
 deliver(f,2);f.a.delete(page.id);assert.equal(f.source.hasProjectChanges!('project'),true);assert.equal(f.source.hasProjectChanges!('other'),false);deliver(f,3);assert.equal(f.source.hasProjectChanges!('project'),false);
});
test("existing databases with missing technical tables are refused intact instead of repaired",t=>{
 const f=fixture(t);f.a.create({project_id:'project',title:'retained'});const db=new DatabaseSync(homeSqlitePath(f.aHome,'pages'));try{db.exec('DROP TABLE '+f.a.namespace+'_replica_resolutions');}finally{db.close();}
 assert.throws(()=>openPagesStore(f.aHome),{code:'storage.schema_structure_mismatch'});assert.equal(f.a.list('project')[0]!.title,'retained');
});
