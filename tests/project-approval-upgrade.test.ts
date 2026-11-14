import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { goalsApprovalTransferManifest, GOALS_PROJECT_DATABASE, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkLocalHost, PROJECT_DATABASE_BASELINE, PROJECT_DATABASE_VERSION_3_SCHEMA, molisWorkHostProjectReference,
  pluginSyncDatabaseDeclaration, pluginSyncNamespace, projectApprovalUpgrade, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { inspectPluginProjectDatabaseSet, openPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { approvalRequiresPerson, projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { bindDatabaseSpace, describeSqliteSchema, listSqliteObjects, LocalSqliteStorage, readStorageSpace, runSqliteUpgrade, sqliteBaselineTriggers, type StorageSpace } from "@molis-ai/molis-work-storage";
import { catalogHome } from "./fixtures/home-upgrade-home.js";
import { serveTestHost } from "./fixtures/test-home.js";

const project = "p-old";
const time = "2026-11-12T10:30:00Z";
const baseline = PROJECT_DATABASE_BASELINE;
const inspector = { scratch: () => new LocalSqliteStorage(":memory:").db, objects: listSqliteObjects, shape: describeSqliteSchema };
const tables = (db: ReturnType<typeof inspector.scratch>) => listSqliteObjects(db).filter(row => row.type === "table").map(row => row.name);

function library(t: TestContext, version?: 1 | 2 | 3 | 4, location?: { path: string; projectId: string; space: StorageSpace }) {
  const dir = location ? null : mkdtempSync(join(tmpdir(), "molis-project-approval-v3-"));
  const path = location?.path ?? join(dir!, "isolated-project.db"), project = location?.projectId ?? "p-old";
  const storage = new LocalSqliteStorage(path);
  t.after(() => { if (storage.db.open) storage.close(); if (dir) rmSync(dir, { force: true, recursive: true }); });
  const { db } = storage;
  db.exec(PROJECT_DATABASE_VERSION_3_SCHEMA + "PRAGMA user_version=3");
  if (location) bindDatabaseSpace(db, location.space);
  db.prepare("INSERT INTO project_root(project_id, created_at) VALUES (?, ?)").run(project, time);
  const platformTables = tables(db);
  if (!version) return { path, db, storage, platformTables };
  const manifest = goalsApprovalTransferManifest(goalsManifest, version), declaration = manifest.databases!.project!;
  const old = pluginSyncNamespace(manifest, "project_goals");
  openPluginProjectDatabase(db, { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration }, inspector,
    { path, platformSchema: pluginSyncDatabaseDeclaration(manifest, declaration).schema.slice(declaration.schema.length),
      platformPrelude: PROJECT_DATABASE_VERSION_3_SCHEMA });
  db.prepare("INSERT INTO boards(project_id,created_at,updated_at) VALUES (?,?,?)").run(project,time,time);
  db.prepare(`INSERT INTO goals(goal_id,project_id,title,outcome,why,business_logic,definition_state,decomposition_state,validity_state,fulfillment_state,created_at,updated_at)
    VALUES ('goal',?,'Launch','Published','Reason','Logic','accepted','closed_leaf','valid','unmet',?,?)`).run(project,time,time);
  db.prepare(`INSERT INTO goal_event_trusted_decisions VALUES
    ('decision-event',?,'goal','local-person','user','web','web:projects','web:click-1','old-request','accept','Approved',1,'{}',NULL,?)`).run(project,time);
  db.prepare(`INSERT INTO goal_event_applied_decisions(decision_id,project_id,goal_id,governance_decision_id,event_id,conclusion,accepts_requirements,scope_json,actor_id,authority_source,recorded_at)
    VALUES ('applied',?,'goal','decision-event','event-1','Approved',1,'{}','local-person','web',?)`).run(project,time);
  db.prepare("UPDATE goal_event_applied_decisions SET request_id='old-request',selected_option_id='accept',config_version=3,agreement_version=2 WHERE decision_id='applied'").run();
  db.prepare(`INSERT INTO goal_work_events(event_id,project_id,goal_id,kind,title,payload_json,actor_id,actor_kind,received_at,journal_seq)
    VALUES ('event-1',?,'goal','system','Decision',?,'local-person','user',?,1)`)
    .run(project, JSON.stringify({ operation: "user_decision", decision_id: "applied", governance_decision_id: "decision-event",
      request_id: "old-request", selected_option_id: "accept", conclusion: "Approved", accepts_requirements: true,
      effects: [], scope: {}, authorized_change: null, config_version: 3, agreement_version: 2 }), time);
  db.prepare(`INSERT INTO goal_tree_proposals(proposal_id,project_id,root_goal_id,submitted_by,state,version,base_event_cursor,summary,created_at,updated_at)
    VALUES ('proposal',?,'goal','author','partially_applied',3,0,'Plan',?,?)`).run(project,time,time);
  db.prepare(`INSERT INTO goal_tree_proposal_items(item_id,proposal_id,project_id,ordinal,kind,operation,payload_json,source_refs_json,reason,confidence,affected_objects_json,baseline_versions_json,state,created_at,updated_at)
    VALUES ('item','proposal',?,0,'goal','create','{}','[]','Reason',1,'[]','[]','applied',?,?)`).run(project,time,time);
  db.prepare(`INSERT INTO goal_tree_proposal_decisions VALUES
    ('decision-tree',?,'proposal','item','confirmed','local-person','runtime_dialogue','agent','session','message','Original reason',NULL,'[]',?)`).run(project,time);
  db.prepare(`INSERT INTO policy_bindings VALUES
    ('first',?,NULL,'project_default','{"human_approval":false}','active','local-person','Original',?),
    ('second',?,NULL,'project_default','{"human_approval":true}','active','local-person','Reconsidered',?),
    ('object-rule',?,'goal','goal','{"human_approval":true}','active','local-person','Goal required',?)`).run(project,time,project,time,project,time);
  db.prepare(`INSERT INTO goal_event_concerns(concern_id,project_id,goal_id,event_id,title,statement,scope_json,blocks_closure,status,created_at,updated_at)
    VALUES ('concern',?,'goal','warning','Risk','Reason','{}',0,'open',?,?)`).run(project,time,time);
  if (version >= 3) db.prepare("UPDATE goal_event_concerns SET cited_subjects_json=? WHERE concern_id='concern'").run('[{"kind":"risk","id":"risk-1"}]');
  if (version < 4) db.prepare("INSERT INTO planning_method_packs VALUES (?,'old-method',1,1,'{}',?,?)").run(project,time,time);
  db.prepare(`UPDATE ${old}_context SET project_id=? WHERE id=1`).run(project);
  db.prepare(`UPDATE ${old}_replica_state SET cursor=40 WHERE id=1`).run();
  db.prepare(`INSERT INTO ${old}_replica_outbox VALUES ('old-key',12,'pending original send')`).run();
  db.prepare(`INSERT INTO ${old}_replica_conflicts VALUES ('old-key','original competing update','conflict',0)`).run();
  return { path, db, storage, platformTables, old };
}

test("APR-19 and APR-17 the normal Home upgrade reopens a v3 project with v4 Goals approval rules and a historical proposal decision", { timeout: 30_000 }, async t => {
  await t.test("upgraded project and receipt", async test => {
    const { home, project: registered } = await catalogHome(t), path = registered.database_path, projectId = registered.project_id;
    for (const filename of [path, path + "-wal", path + "-shm"]) rmSync(filename, { force: true });
    const before = library(test, 4, { path, projectId, space: readStorageSpace(home)! });
    before.storage.close();
    runHomeUpgrade(home);
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    let web: Awaited<ReturnType<typeof serveTestHost>> | undefined;
    test.after(async () => {
      try { await web?.close(); } finally { await host.close(); }
    });
    web = await serveTestHost(null, { home, host });
    const reference = molisWorkHostProjectReference({ databasePath: path, projectId });
    const caller = await host.localPersonContext(reference);
    const actions = host.actionClient(reference);
    assert.equal((await actions.invoke(caller, goalsActions.policyResolve, { goal_id: "goal" }) as { policy: { human_approval: boolean } }).policy.human_approval, true);
    const history = await actions.invoke(caller, goalsActions.treeRead, { proposal_id: "proposal" }) as { proposals: { decisions: Array<{ decision_id: string; authority_source: string }> }[] };
    assert.deepEqual(history.proposals[0]?.decisions.map(d => [d.decision_id, d.authority_source]), [["decision-tree", "runtime_dialogue"]]);
    const submitted = await actions.invoke(caller, goalsActions.treeSubmit, { summary: "A new approved child", root_goal_id: "goal", idempotency_key: "submit-new",
      items: [{ item_id: "item-new", kind: "goal", operation: "create", payload: { goal_id: "goal-new", title: "New child" },
        source_refs: ["project:original"], reason: "Create a verified target", confidence: 1 }] }) as { proposal: { proposal_id: string } };
    const endpoint = `/projects/${encodeURIComponent(projectId)}/api/project-approvals`;
    const lookup = { action: { capability_id: goalsActions.treeDecide.capability_id, version: goalsActions.treeDecide.version, provider_id: goalsManifest.plugin_id },
      request_id: submitted.proposal.proposal_id };
    const original = await web.web.post<ReviewRequest>(endpoint + "/request", lookup);
    const command = { reference: original.reference, choice_id: "confirm", request_key: "confirm-v4" };
    const result = await web.web.post<{ record: { decision_id: string; actor_id: string }; result: { applied_item_ids: string[] } }>(endpoint + "/decide", command);
    assert.deepEqual(result.result.applied_item_ids, ["item-new"]);
    assert.equal(result.record.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.deepEqual(await web.web.post(endpoint + "/decide", command), { record: result.record, replayed: true });
    const prior = await web.web.post<ReviewRequest>(endpoint + "/request", { reference: original.reference });
    assert.equal(prior.decision?.decision_id, result.record.decision_id);
    assert.deepEqual(prior.requirements.map(req => req.id), ["item-new"]);
    const goalAction = { capability_id: goalsActions.decide.capability_id, version: goalsActions.decide.version, provider_id: goalsManifest.plugin_id };
    const { goal } = await actions.invoke(caller, goalsActions.create, { title: "The decision's actual target", idempotency_key: "intent-v4",
      requirements: [{ requirement_id: "human-v4", statement: "Person checks the result", human_decision_required: true }] }) as { goal: { goal_id: string } };
    const { decision_request } = await actions.invoke(caller, goalsActions.requestDecision, { goal_id: goal.goal_id, idempotency_key: "prepare-v4",
      question: "Has the requirement been met?", options: [{ option_id: "yes", label: "Met", impact: "Record the result" },
        { option_id: "no", label: "More work", impact: "Keep working" }], purpose: "requirement_acceptance", scope: { requirement_ids: ["human-v4"] },
    }) as { decision_request: { request_id: string } };
    const eventLookup = { action: goalAction, request_id: decision_request.request_id };
    const unchecked = await web.web.post<ReviewRequest>(endpoint + "/request", eventLookup);
    assert.equal(unchecked.target.subject.id, goal.goal_id);
    assert.ok(unchecked.choices.every(choice => !choice.availability.available));
    const prepared = await web.web.post<ReviewRequest>(endpoint + "/request", { ...eventLookup, draft: { goal_id: goal.goal_id,
      idempotency_key: "decide-v4", request_id: eventLookup.request_id, selected_option_id: "yes", conclusion: "Checked the result",
      scope: { requirement_ids: ["human-v4"] }, effects: [{ kind: "accept_requirements" }] } });
    assert.deepEqual(prepared.choices[0]?.accepts, ["human-v4"]);
    const event = await web.web.post<{ record: ProjectTrustedDecision }>(endpoint + "/decide", { reference: prepared.reference, choice_id: "apply", request_key: "decide-v4" });
    assert.equal(event.record.review.requirements[0]?.disposition, "accepted");
    assert.equal((await web.web.post<ReviewRequest>(endpoint + "/request", { reference: prepared.reference })).decision?.decision_id, event.record.decision_id);
    await host.withProject(reference, ({ store }) => {
      assert.equal(store.db.pragma("user_version", { simple: true }), 4);
      assert.equal(store.db.prepare<[], { approval_id: string }>("SELECT approval_id FROM goal_tree_item_effects WHERE item_id='item-new'").get()?.approval_id, result.record.decision_id);
      assert.ok(store.db.prepare("SELECT goal_id FROM goals WHERE goal_id='goal-new'").get());
      assert.equal(store.db.prepare<[], { count: number }>("SELECT count(*) AS count FROM project_review_decisions").get()?.count, 4);
      assert.equal(store.db.prepare<[string], { governance_decision_id: string }>("SELECT governance_decision_id FROM goal_event_applied_decisions WHERE goal_id=?").get(goal.goal_id)?.governance_decision_id,
        event.record.decision_id);
    });
  });
});

test("APR-19 moves v1–v4 approvals to Goals v5 in the project upgrade transaction and preserves the old sync receipt in a backup", async t => {
  for (const version of [1, 2, 3, 4] as const) {
    const { db, path, storage, old, platformTables } = library(t, version);
    const source = db.prepare("SELECT * FROM goal_event_trusted_decisions").get();
    const backup = path + ".before";
    await db.backup(backup);
    assert.deepEqual(runSqliteUpgrade(db, path, baseline), { from: 3, to: 4 });
    assert.equal(db.prepare<[string], { version: number }>("SELECT version FROM plugin_project_databases WHERE plugin_id=?").get(goalsManifest.plugin_id)?.version, 5);
    assert.equal(tables(db).some(name => name.startsWith(old! + "_")), false);
    assert.equal(tables(db).some(name => ["goal_event_trusted_decisions","goal_tree_proposal_decisions","policy_bindings","planning_method_packs"].includes(name)), false);
    assert.equal(db.prepare("SELECT name FROM pragma_table_info('goal_event_config_versions') WHERE name = 'adopted_planning_json'").get(), undefined);
    const historical = projectReviewDecisions(db, project).read("decision-event")!;
    assert.ok("kind" in historical && historical.kind === "history");
    assert.deepEqual(historical.original, source);
    const dialogue = projectReviewDecisions(db, project).read("decision-tree")!;
    assert.ok("kind" in dialogue && dialogue.kind === "history");
    assert.equal(dialogue.original.authority_source, "runtime_dialogue");
    assert.equal(dialogue.original.item_id, "item");
    assert.equal(db.prepare<[], { governance_decision_id: string }>("SELECT governance_decision_id FROM goal_event_applied_decisions WHERE decision_id='applied'").get()?.governance_decision_id, historical.decision_id);
    assert.equal(db.prepare<[], { cited_subjects_json: string }>("SELECT cited_subjects_json FROM goal_event_concerns WHERE concern_id='concern'").get()?.cited_subjects_json,
      version >= 3 ? '[{"kind":"risk","id":"risk-1"}]' : "[]");
    const rules = projectApprovalRules(db, project).read();
    assert.deepEqual(rules.rules.map(rule => [rule.id, rule.reason]), [["first","Original"],["second","Reconsidered"],["object-rule","Goal required"]]);
    assert.equal(approvalRequiresPerson(rules), false);
    const scoped = rules.rules[2]!.scope;
    assert.ok(scoped.kind === "object");
    assert.equal(approvalRequiresPerson(rules, scoped), true);
    assert.equal(approvalRequiresPerson(rules, { ...scoped, subject: { ...scoped.subject, id: "another-goal" } }), true);
    assert.equal(approvalRequiresPerson(rules, { ...scoped, owner: { kind: "plugin", plugin_id: "third-party", publisher_signature: "other" } }), false);
    const selected = goalsApprovalTransferManifest(goalsManifest, GOALS_PROJECT_DATABASE.version), decl = selected.databases!.project!;
    const namespace = pluginSyncNamespace(selected, "project_goals");
    assert.equal(db.prepare<[], { cursor: number }>(`SELECT cursor FROM ${namespace}_replica_state WHERE id=1`).get()?.cursor, 0);
    const platform = new LocalSqliteStorage(":memory:");
    const added = (() => { try { platform.db.exec(baseline.schema); return tables(platform.db); } finally { platform.close(); } })();
    const audit = { manifests: [selected], platformTables: [...new Set([...platformTables, ...added])],
      platformTriggers: sqliteBaselineTriggers(baseline.schema),
      platformExtension: () => ({ platformSchema: pluginSyncDatabaseDeclaration(selected, decl).schema.slice(decl.schema.length),
        platformPrelude: PROJECT_DATABASE_BASELINE.schema }) };
    assert.equal(inspectPluginProjectDatabaseSet(db, audit, inspector, path)[0]?.version, 5);
    storage.close();
    const restored = new LocalSqliteStorage(path, { readonly: true }), original = new LocalSqliteStorage(backup, { readonly: true });
    try {
      assert.deepEqual(projectReviewDecisions(restored.db, project).read("decision-event"), historical);
      assert.equal(original.db.prepare<[], { cursor: number }>(`SELECT cursor FROM ${old}_replica_state`).get()?.cursor, 40);
      assert.equal(original.db.prepare<[], { operation: string }>(`SELECT operation FROM ${old}_replica_outbox`).get()?.operation, "pending original send");
      assert.equal(original.db.prepare<[], { event: string }>(`SELECT event FROM ${old}_replica_conflicts`).get()?.event, "original competing update");
      if (version < 4) assert.ok(original.db.prepare("SELECT 1 FROM planning_method_packs WHERE method_id='old-method'").get());
    } finally { restored.close(); original.close(); }
  }
});

test("APR-19 keeps the complete old owner and schema on late failure, wrong publisher, broken link or no ledger", t => {
  for (const bad of [
    "UPDATE plugin_project_databases SET publisher_signature='another-publisher'",
    "UPDATE goal_event_applied_decisions SET governance_decision_id='missing'",
    "UPDATE goal_event_applied_decisions SET selected_option_id='another-option'",
    `UPDATE goal_event_applied_decisions SET authorized_change_json='{"outcome":"Different approved result"}'`,
    `UPDATE goal_work_events SET payload_json=json_set(payload_json,'$.agreement_version',99) WHERE event_id='event-1'`,
    `UPDATE goal_work_events SET payload_json=json_remove(payload_json,'$.effects') WHERE event_id='event-1'`,
    "DELETE FROM plugin_project_databases",
    `CREATE TRIGGER corrupt_provenance AFTER UPDATE ON plugin_project_databases BEGIN
      UPDATE plugin_project_databases SET version=99; END;`,
    "injected write failure",
  ]) {
    const { db, path, old } = library(t, 4);
    const late = bad === "injected write failure";
    if (!late) db.exec(bad);
    const snapshot = () => ({ shape: describeSqliteSchema(db), ledger: db.prepare("SELECT * FROM plugin_project_databases").all(),
      decisions: db.prepare("SELECT * FROM goal_event_trusted_decisions").all(), rules: db.prepare("SELECT * FROM policy_bindings").all(),
      effects: db.prepare("SELECT * FROM goal_event_applied_decisions").all(), events: db.prepare("SELECT * FROM goal_work_events").all(),
      outbox: db.prepare(`SELECT * FROM ${old}_replica_outbox`).all() });
    const before = snapshot();
    const attempt = late ? { ...baseline, upgrades: [ ...PROJECT_DATABASE_BASELINE.upgrades?.filter(step => step.from !== 3) ?? [],
      { ...projectApprovalUpgrade, verify() { throw Error("injected write failure"); } }] } : baseline;
    assert.throws(() => runSqliteUpgrade(db, path, attempt), { code: "storage.upgrade_failed" });
    assert.equal(db.pragma("user_version", { simple: true }), 3);
    assert.deepEqual(snapshot(), before);
    assert.equal(tables(db).includes("project_review_decisions"), false);
  }
});

test("APR-19 establishes the current project tables in a library that never had Goals", t => {
  const { db, path } = library(t);
  assert.deepEqual(runSqliteUpgrade(db, path, baseline), { from: 3, to: 4 });
  assert.deepEqual(db.prepare("SELECT plugin_id FROM plugin_project_databases").all(), []);
  assert.deepEqual(projectApprovalRules(db, project).read().rules, []);
});
