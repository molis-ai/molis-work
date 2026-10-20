import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import {
  MolisWorkSessionRegistry,
  SESSION_REGISTRY_OWNER,
  RuntimeContextBindingRepository,
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
} from "@molis-ai/molis-work-module-private-work-context";

test("Private Work Context public entrypoint preserves private Session facts across restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-private-work-context-"));
  const home = path.join(directory, ".molis-work");
  let registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const session = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      surface_id: "surface-private-owner",
      project_id: "project-private-owner",
      current_goal_id: "goal-private-owner",
      workspace_path: directory,
      title: "Private owner",
      metadata: { adapter_hint: "kept-local" },
    });
    const event = registry.appendEvent({
      session_id: session.session_id,
      source: "molis_work",
      kind: "status",
      source_id: "private-owner-event",
      content: "local-only-content",
      metadata: { phase: "ready", access_token: "must-not-persist" },
    });
    assert.equal(event.metadata.phase, "ready");
    assert.equal(event.metadata.access_token, undefined);
    const draft = registry.createHandoffDraft({
      source_session_id: session.session_id,
      source_project_id: "project-private-owner",
      source_goal_id: "goal-private-owner",
      target_runtime_id: "codex",
      target_project_id: "project-private-owner",
      content: "handoff-context",
      actor_id: "user",
    });
    assert.equal(registry.cancelHandoff(draft.package_id).state, "cancelled");
    registry.setStatus({
      session_id: session.session_id,
      actor_id: "user",
      user_confirmed: true,
      status: "closed",
    });
    registry.close();

    registry = await openWorkSessionRegistry({ homeDirectory: home });
    assert.equal(registry.get(session.session_id).status, "closed");
    assert.equal(registry.get(session.session_id).metadata.adapter_hint, "kept-local");
    assert.equal(registry.events(session.session_id)[0]?.content, "local-only-content");
    assert.equal(registry.getHandoff(draft.package_id).state, "cancelled");
    assert.equal(registry.goalHistory(session.session_id)[0]?.goal_id, "goal-private-owner");
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Runtime context binding facts are stored by the Private Work Context repository", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE projects (project_id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO projects (project_id) VALUES (?)").run("project-context-owner");
    createRuntimeContextBindingTables(db);
    createRuntimeContextSetupRequestTable(db);
    createRuntimeContextSuggestionRejectionTable(db);
    const repository = new RuntimeContextBindingRepository(db, {
      ledger: createContextLedger(db, { authorize: () => true }),
      assertProject: (id) => { assert.equal(id, "project-context-owner"); },
    });
    const binding = {
      binding_id: "binding-context-owner",
      runtime_id: "codex",
      stable_work_context_id: "thread-context-owner",
      project_id: "project-context-owner",
      bound_by: "user",
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    };
    repository.insert(binding);
    repository.appendEvent({
      binding,
      type: "context.bound",
      previous_project_id: null,
      actor_id: "user",
      created_at: binding.created_at,
    });
    repository.insertSetupRequest({
      runtime_id: binding.runtime_id,
      persistence_id: binding.stable_work_context_id,
      idempotency_key: "setup-context-owner",
      request_fingerprint: "fingerprint",
      project_id: binding.project_id,
      created_at: binding.created_at,
    });
    assert.equal(repository.find(binding.runtime_id, binding.stable_work_context_id)?.binding_id, binding.binding_id);
    assert.equal(repository.listEvents()[0]?.type, "context.bound");
    assert.equal(repository.findSetupRequest(
      binding.runtime_id,
      binding.stable_work_context_id,
      "setup-context-owner",
    )?.project_id, binding.project_id);
    assert.equal(repository.removeProjectFacts(binding.project_id, "user", binding.updated_at), 1);
    assert.equal(repository.list().length, 0);
  } finally {
    db.close();
  }
});
import { openWorkSessionRegistry,createSessionReplicationSupport } from "@molis-ai/molis-work-app-local-host";

test('PCSYNC-23 Session owner opening rolls back schema and association setup together without writing private content', async t => {
  const home=await mkdtemp(path.join(os.tmpdir(),'session-open-refusal-'));t.after(()=>rm(home,{recursive:true,force:true}));
  await assert.rejects(MolisWorkSessionRegistry.open({homeDirectory:home,replication:createSessionReplicationSupport(),createLedger(db){
    createContextLedger(db,{authorize:()=>true});throw new Error('ASSOCIATION_SETUP_REFUSED');
  }}),/ASSOCIATION_SETUP_REFUSED/);
  const db=new Database(path.join(home,'sessions','sessions.db'));
  try{assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(),[]);}
  finally{db.close();}
  const registry=await openWorkSessionRegistry({homeDirectory:home});try{assert.deepEqual(registry.list(),[]);}finally{registry.close();}
});

test('PCSYNC-12 Session owner refuses a foreign version before WAL, private keys or association writes', async t => {
  const home=await mkdtemp(path.join(os.tmpdir(),'session-readonly-refusal-'));t.after(()=>rm(home,{recursive:true,force:true}));
  const directory=path.join(home,'sessions');await mkdir(directory);
  const file=path.join(directory,'sessions.db'),db=new Database(file);
  db.exec('CREATE TABLE session_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  db.prepare('INSERT INTO session_meta VALUES (?,?)').run('owner',SESSION_REGISTRY_OWNER);
  db.prepare('INSERT INTO session_meta VALUES (?,?)').run('schema_version','6');db.close();
  const before=await readFile(file);
  await assert.rejects(MolisWorkSessionRegistry.open({homeDirectory:home,replication:createSessionReplicationSupport(),createLedger(){assert.fail('a refused version cannot initialize associations')}}), {code:'work.session.registry_reader_too_old'});
  assert.deepEqual(await readFile(file),before);
  assert.deepEqual(await readdir(directory),['sessions.db'],'refusal must not create WAL, SHM or private content files');
});

test('PCSYNC-12 Session owner does not adopt a nonempty unowned database', async t => {
  const home=await mkdtemp(path.join(os.tmpdir(),'session-unowned-refusal-'));t.after(()=>rm(home,{recursive:true,force:true}));
  const directory=path.join(home,'sessions');await mkdir(directory);
  const file=path.join(directory,'sessions.db'),db=new Database(file);
  db.exec('CREATE TABLE someone_elses_data(value TEXT); INSERT INTO someone_elses_data VALUES (\'original\')');db.close();
  const before=await readFile(file);
  await assert.rejects(openWorkSessionRegistry({homeDirectory:home}),{code:'work.session.registry_unknown'});
  assert.deepEqual(await readFile(file),before);assert.deepEqual(await readdir(directory),['sessions.db']);
});
