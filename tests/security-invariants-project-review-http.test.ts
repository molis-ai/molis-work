import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { HomeConsentLedger, LocalMcpServer, pluginInstallActions, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { TRUSTED_REVIEW_OWNER_INPUT_SCHEMA, type ProjectApprovalRulePage, type ProjectTrustedDecision, type TrustedReviewLookup, type TrustedReviewOffer } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { defineAction, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { openTestHome } from "./fixtures/test-home.js";
import { person } from "./fixtures/home-sandbox.js";
import { newPublisher, PACKAGE_PLUGIN_ID, signedPackage } from "./fixtures/sandbox-package.js";

async function removeGoals(env: Awaited<ReturnType<typeof openTestHome>>, pid: string) {
  await env.host.homePlugins?.ready();
  const ledger = new HomeConsentLedger(env.home);
  const consent = ledger.consents("io.molis.work.goals").find(row => row.kind === "always_on" && row.revoked_at === null);
  if (consent) ledger.revoke(consent.consent_id, new Date().toISOString());
  await env.host.ensureWebCatalog(env.home).withCatalog({ homeDirectory: env.home },
    catalog => catalog.removeProjectPlugin({ project_id: pid, plugin_id: "goals", actor_id: LOCAL_PERSON_ACTOR_ID }));
}

function notePlugin() {
  const pluginId = "io.molis.work.example.approval-notes", permission = "storage:private";
  let wait: (() => Promise<void>) | undefined;
  let replaceEvidence: ((offer: TrustedReviewOffer) => TrustedReviewOffer) | undefined;
  const libraries = new Map<string, NonNullable<NonNullable<Parameters<PluginDefinition["start"]>[0]["services"]>["project_database"]>>();
  const ports = (projectId: string | null | undefined) => libraries.get(projectId ?? "") ?? assert.fail("project instance was never started");
  const read = { capability_id: "approval-notes.review", version: 1 };
  const apply = defineAction({ capability_id: "approval-notes.save", version: 1, operation: "command",
    action: { title: "Save note", description: "Save the reviewed version of one note.", kind: "operation", scope: "project", scheduling: "concurrent",
      audiences: ["user", "agent"], permissions: [permission], subject_kinds: ["note"], requires_trusted_decision: true, trusted_decision_request: read,
      input_schema: { type: "object", properties: { id: { type: "string" }, version: { type: "number" }, text: { type: "string" } },
        required: ["id", "version", "text"], additionalProperties: false } } }, async (caller, input: { id: string; version: number; text: string }) => {
    await wait?.();
    return ports(caller.project_id).transaction(() => caller.beforeEffect(), tx => {
      const changes = tx.run("UPDATE review_notes SET accepted=? WHERE id=? AND revision=? AND accepted IS NULL",
        [input.text, input.id, input.version]).changes;
      if (changes !== 1 && changes !== 1n) throw new ActionError("actions.conflict", "Original note changed");
      return { id: input.id, text: input.text };
    });
  });
  const reader = defineAction({ ...read, operation: "query", action: { title: "Read review", description: "Read the original pending note.",
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user"], permissions: [permission], subject_kinds: ["note"],
    input_schema: TRUSTED_REVIEW_OWNER_INPUT_SCHEMA } }, (caller, { request_id }: { request_id: string }) => {
    const row = ports(caller.project_id).get("SELECT id, body, revision, accepted FROM review_notes WHERE id=?", [request_id]);
    if (!row) throw new ActionError("actions.missing", "Missing note");
    const offer = { target: { subject: { kind: "note", id: String(row.id) }, version: String(row.revision) },
      request: { summary: String(row.body), requirements: [], approver: { kind: "person" },
        choices: [{ id: "accept", label: { literal: "Approve note" }, availability: row.accepted === null ? { available: true }
          : { available: false, code: "actions.conflict", reason: { literal: "Already approved" } }, accepts: [], returns: [] }], expires_at: null },
      commands: { accept: { id: row.id, version: row.revision, text: row.body } } } satisfies TrustedReviewOffer;
    return replaceEvidence ? replaceEvidence(offer) : offer;
  });
  const manifest: PluginManifest = { plugin_id: pluginId, schema_version: 1, host_api_version: 1, version: "1.0.0",
    name: "Approval notes", kind: "app", publisher: { publisher_id: "example", signature: "approval-notes-fixture" },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [{ permission, required: true, reason: "Read and update the original note" }],
    capabilities: { provides: [], consumes: [] }, actions: [apply.definition, reader.definition], ui: { contributions: [] }, artifacts: { produces: [], consumes: [] },
    databases: { project: { store_name: "review-notes", version: 1, schema: "CREATE TABLE review_notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, accepted TEXT)",
      read_permission: permission, write_permission: permission } },
  };
  const definition: PluginDefinition = { manifest, async start(context) {
    libraries.set(context.project_id!, context.services!.project_database!);
    return { kind: "app", views: [], actions: [apply.handler, reader.handler] };
  } };
  return { definition, apply, pluginId,
    wait(value?: () => Promise<void>) { wait = value; },
    evidence(value?: typeof replaceEvidence) { replaceEvidence = value; },
  };
}

test("APR-17/18 S-17 the real Web and management MCP reach one original review in a project without the Goals activation", async t => {
  const fixture = notePlugin(), env = await openTestHome(t, { host: { pluginFixtures: { project: [fixture.definition] } } });
  const project = await env.createProject("Project review fixture"), other = await env.createProject("Other project");
  const pid = project.project_id, ref = project.reference;
  const activate = await env.host.localPersonContext(ref);
  await removeGoals(env, pid);
  const owner = (await env.host.inspectPreparedActionMetadata(activate, ref)).find(view => view.capability_id === fixture.apply.definition.capability_id)?.provider;
  const state = await env.host.withProject(ref, async runtime => (await runningProjectPlatform(runtime.store, pid))?.supervisor.state(fixture.pluginId));
  assert.ok(owner?.plugin_install_id, JSON.stringify(state));
  assert.equal((await env.host.inspectPreparedActionMetadata(activate, ref)).some(view => view.provider.plugin_id === "io.molis.work.goals"
    && view.provider.project_id === pid), false);
  const action = { capability_id: fixture.apply.definition.capability_id, version: 1, provider_id: owner.provider_id };
  await env.host.withProject(ref, runtime => {
    runtime.store.db.prepare("INSERT INTO review_notes VALUES ('web','Web note',1,NULL),('mcp','MCP note',1,NULL),('stale','Before change',1,NULL)").run();
  });
  const prefix = (id = pid) => `/projects/${encodeURIComponent(id)}/api/project-approvals`;
  const settings = (id = pid) => "/api/settings/authorizations/project-rules?project=" + encodeURIComponent(id);
  const get = (path: string) => fetch(env.origin + path, { headers: { "x-molis-work-control-token": env.controlToken } });
  const readRules = async (id = pid, tail = ""): Promise<ProjectApprovalRulePage> => {
    const response = await get(settings(id) + tail);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body as ProjectApprovalRulePage;
  };
  await assert.rejects(env.web.get(settings()), { code: "actions.forbidden" });
  const emptyRules = await readRules();
  const edit = { kind: "set", scope: { kind: "project_default" }, expected_revision: emptyRules.revision,
    requires_person: true, reason: "Review project writes" };
  await assert.rejects(env.web.post(settings(other.project_id), edit), { code: "actions.conflict" });
  await assert.rejects(env.web.post(settings(), { ...edit, actor_id: "another person" }), { code: "actions.input_invalid" });
  const revisedRules = await env.web.post<ProjectApprovalRulePage>(settings(), edit);
  assert.equal(revisedRules.rules[0]?.created_by, LOCAL_PERSON_ACTOR_ID);
  await assert.rejects(env.web.post(settings(), edit), { code: "actions.conflict" });
  assert.deepEqual((await readRules(other.project_id)).rules, []);
  const lookup = (request_id: string): TrustedReviewLookup => ({ action, request_id });
  const read = (id: string) => env.web.post<ReviewRequest>(prefix() + "/request", lookup(id));
  const management = new LocalMcpServer(withCatalog, "management", null,
    { homeDirectory: env.home, runtimeContext: { runtime_id: "review-management-fixture", stable_work_context_id: "review-fixture", host_declares_stable: true } },
    env.host, env.origin, async () => undefined);
  t.after(() => management.close());
  const mcp = async <T>(name: string, input: object) => JSON.parse(await management.callTool(name,
    { database_path: project.database_path, project_id: pid, ...input })) as T;
  const readBack = (id: string) => env.host.withProject(ref, runtime => projectReviewDecisions(runtime.store.db, pid).read(id));
  const notes = () => env.host.withProject(ref, runtime => runtime.store.db.prepare("SELECT id,accepted FROM review_notes WHERE accepted IS NOT NULL ORDER BY id").all());
  const webReview = await read("web");
  const webCommand = { reference: webReview.reference, choice_id: "accept", request_key: "same-click" };
  const originalOwner = webReview.target.owner;
  assert.equal(originalOwner.kind, "plugin");
  for (const otherOwner of [
    { ...originalOwner, provider_id: "other-provider" },
    { ...originalOwner, installation_generation: "other-generation" },
  ]) {
    fixture.evidence(offer => ({ ...offer, request: { ...offer.request, requirements: [{
      id: "evidence-scope", version: "1", target: webReview.target, statement: "Review checked note", requires_person: true,
      evidence: [{ target: { ...webReview.target, owner: otherOwner }, tier: "machine_checked" }],
    }] } }));
    await assert.rejects(read("web"), { code: "actions.input_invalid" });
  }
  fixture.evidence();
  assert.deepEqual(await read("web"), webReview);
  assert.deepEqual((await mcp<ReviewRequest>("molis_work_v1_review_request", lookup("web"))).reference, webReview.reference);
  assert.deepEqual(await env.web.post(prefix() + "/request", { reference: webReview.reference }), webReview);
  await assert.rejects(env.web.post(prefix(other.project_id) + "/request", { reference: webReview.reference }), { code: "actions.missing" });
  await assert.rejects(env.web.post(prefix(other.project_id) + "/decide", webCommand), { code: "actions.missing" });
  await assert.rejects(env.web.post(prefix() + "/decide", { ...webCommand, actor_id: LOCAL_PERSON_ACTOR_ID }), { code: "actions.input_invalid" });
  await assert.rejects(env.web.post(prefix() + "/decide", { ...webCommand,
    reference: { ...webCommand.reference, owner: { ...webCommand.reference.owner, installation_generation: "old" } } }), { code: "actions.missing" });
  const forged = { ...activate, actor_kind: "user" as const, user_action: { source: "web", conversation_ref: "untrusted", message_ref: "approve me" } };
  for (const audience of ["user", "agent"] as const) await assert.rejects(env.host.actionClient(ref).invoke({ ...forged, audience }, action,
    { id: "web", version: 1, text: "Web note" }), { code: "actions.forbidden" });
  assert.deepEqual(await notes(), []);
  const web = await env.web.post<{ record: ProjectTrustedDecision }>(prefix() + "/decide", webCommand);
  assert.equal(web.record.source.entry.source, "web");
  assert.deepEqual(await readBack(web.record.decision_id), web.record);
  const applied = await mcp<ReviewRequest>("molis_work_v1_review_request", { reference: webReview.reference });
  assert.deepEqual(applied.decision, { reference: webReview.reference, decision_id: web.record.decision_id });
  assert.equal(applied.summary, webReview.summary);
  assert.ok(applied.choices.every(choice => !choice.availability.available));
  await env.host.withProject(ref, runtime => runtime.store.db.prepare("UPDATE review_notes SET body='Edited after approval',revision=2 WHERE id='web'").run());
  await assert.rejects(read("web"), { code: "actions.conflict" });
  assert.deepEqual(await mcp<ReviewRequest>("molis_work_v1_review_request", { reference: webReview.reference }), applied);
  const replay = await mcp<{ record: ProjectTrustedDecision; replayed: boolean }>("molis_work_v1_review_decide", webCommand);
  assert.deepEqual(replay, { record: web.record, replayed: true });
  const mcpReview = await mcp<ReviewRequest>("molis_work_v1_review_request", lookup("mcp"));
  const mcpRecord = (await mcp<{ record: ProjectTrustedDecision }>("molis_work_v1_review_decide",
    { reference: mcpReview.reference, choice_id: "accept", request_key: "management-choice" })).record;
  assert.equal(mcpRecord.source.entry.source, "management");
  assert.equal(mcpRecord.actor_id, LOCAL_PERSON_ACTOR_ID);
  const reviewHistory = await get("/api/settings/authorizations/reviews?project=" + encodeURIComponent(pid));
  assert.equal(reviewHistory.status, 200);
  const sources = (await reviewHistory.json() as { rows: { id: string; person: string; title: string }[] }).rows;
  assert.ok(sources.some(row => row.id === web.record.decision_id && row.person === LOCAL_PERSON_ACTOR_ID && row.title === "Web note"));
  assert.ok(sources.some(row => row.id === mcpRecord.decision_id && row.person === LOCAL_PERSON_ACTOR_ID && row.title === "MCP note"));
  const beforeRuleChange = await read("stale");
  await env.web.post(settings(), { ...edit, expected_revision: revisedRules.revision, requires_person: false, reason: "Policy updated" });
  await assert.rejects(env.web.post(prefix() + "/decide", { reference: beforeRuleChange.reference, choice_id: "accept", request_key: "old-rule" }),
    { code: "actions.conflict" });
  const stale = await read("stale");
  assert.notEqual(stale.reference.version, beforeRuleChange.reference.version);
  let entered!: () => void, resume!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { resume = resolve; });
  fixture.wait(() => { entered(); return held; });
  try {
    const submitted = env.web.post(prefix() + "/decide", { reference: stale.reference, choice_id: "accept", request_key: "late-change" });
    const refused = assert.rejects(submitted, { code: "actions.conflict" });
    await waiting;
    await env.host.withProject(ref, runtime => runtime.store.db.prepare("UPDATE review_notes SET body='Changed',revision=2 WHERE id='stale'").run());
    resume();
    await refused;
  } finally { resume(); fixture.wait(); }
  assert.deepEqual(await notes(), [{ id: "mcp", accepted: "MCP note" }, { id: "web", accepted: "Web note" }]);
  assert.equal(await env.host.withProject(ref, runtime => projectReviewDecisions(runtime.store.db, pid).forRequest(stale.reference.id)), null);
  await env.host.withProject(ref, runtime => {
    const { db } = runtime.store, rule = projectApprovalRules(db, pid);
    const owner = { kind: "plugin", plugin_id: fixture.pluginId, publisher_signature: "approval-notes-fixture" } as const;
    for (let index = 0; index < 51; index++) db.transaction(() => rule.commit({
      kind: "set", scope: { kind: "object", owner, subject: { kind: "note", id: String(index) } },
      expected_revision: rule.read(false).revision, requires_person: true, reason: "Original rule",
    }, LOCAL_PERSON_ACTOR_ID, new Date().toISOString(), () => undefined)).immediate();
    db.prepare("UPDATE project_approval_rules SET rule_order=? WHERE id=(SELECT id FROM project_approval_rules WHERE project_id=? ORDER BY rule_order DESC LIMIT 1)")
      .run(Number.MAX_SAFE_INTEGER, pid);
  });
  for (const invalid of ["&before_order=&before_id=", "&before_order=7", "&before_order=2.5&before_id=next"]) {
    assert.equal((await get(settings() + invalid)).status, 400);
  }
  const firstPage = await readRules();
  assert.equal(firstPage.rules[0]?.order, Number.MAX_SAFE_INTEGER);
  assert.equal(firstPage.rules.length, 50);
  assert.ok(firstPage.next_cursor);
  const next = "&before_order=" + firstPage.next_cursor.order + "&before_id=" + encodeURIComponent(firstPage.next_cursor.id);
  const following = await readRules(pid, next);
  assert.equal(following.revision, firstPage.revision);
  assert.equal(following.next_cursor, null);
  assert.equal(following.rules.length, 3);
  assert.equal(following.rules.some(row => firstPage.rules.some(prior => prior.id === row.id)), false);
  const earlier = following.rules.find(row => row.state === "active" && row.scope.kind === "object");
  assert.ok(earlier);
  await env.web.post(settings(), { kind: "withdraw", id: earlier.id, expected_revision: following.revision, reason: "Original rule no longer applies" });
  const updated = await readRules(pid, next);
  assert.notEqual(updated.revision, following.revision);
  assert.equal(updated.rules.find(row => row.id === earlier.id)?.state, "withdrawn");
  await assert.rejects(env.web.post(settings(), { ...edit, expected_revision: updated.revision }), { code: "actions.conflict" });
  assert.deepEqual(await readRules(pid, next), updated, "running out of available rule orders does not modify any existing rule");
  await assert.rejects(env.web.post(settings(), { kind: "withdraw", id: earlier.id, expected_revision: following.revision,
    reason: "Stale page" }), { code: "actions.conflict" });
});

const text = { type: "string" } as const;
const flag = { type: "boolean" } as const;
const integer = { type: "integer" } as const;
const strings = { type: "array", items: text } as const;
const object = (properties: Record<string, SandboxSchema>): SandboxSchema => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const option = { id: "accept", label: { literal: "Accept" }, availability: { available: true }, accepts: [], returns: [] };
const offer = { target: { subject: { kind: "note", id: "a" }, version: "1" },
  request: { summary: "Original text", requirements: [], approver: { kind: "person" }, choices: [option], expires_at: null },
  commands: { accept: { id: "a", revision: 1, accepted: "Original text" } } };

function signedNotesReview() {
  return signedPackage(newPublisher(), (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const command = object({ id: text, revision: integer, accepted: text });
    contract.operations.find(row => row.id === "notes.add")!.effects = { storage: ["read", "write"] };
    contract.operations.push({
      id: "notes.review", kind: "query", input: { ...TRUSTED_REVIEW_OWNER_INPUT_SCHEMA, required: ["request_id"] },
      output: object({ target: object({ subject: object({ kind: text, id: text }), version: text }),
        request: object({ summary: text, requirements: { type: "array", items: text }, approver: object({ kind: text }),
          choices: { type: "array", items: object({ id: text, label: object({ literal: text }), availability: object({ available: flag }), accepts: strings, returns: strings }) },
          expires_at: { type: "null" } }), commands: object({ accept: command }) }),
      errors: [], effects: { projectDatabase: ["read"] }, examples: [{ input: { request_id: "a" }, output: offer }],
    }, {
      id: "notes.accept", kind: "command", trusted_review: { reader: "notes.review", subject_kinds: ["note"],
        row: { table: "fixture_review_notes", id_column: "id", version_column: "revision" } },
      input: command, output: flag, errors: [], effects: { projectDatabase: ["write"] }, examples: [{ input: offer.commands.accept, output: true }],
    });
    Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, publisher: manifest.publisher,
      name: manifest.name, version: manifest.version, presentation: false, contract,
      projectDatabase: { version: 1, schema: "CREATE TABLE fixture_review_notes (id TEXT PRIMARY KEY, body TEXT, revision INTEGER, accepted TEXT); CREATE TABLE fixture_review_audit (id TEXT);" } }));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] += `
operations["notes.review"] = async ({ request_id }, sdk) => {
  const row = await sdk.projectDatabase.get("SELECT id, body, revision FROM fixture_review_notes WHERE id=?", [request_id]);
  const view = ${JSON.stringify(offer)};
  view.target.subject.id = row.id;
  view.target.version = String(row.revision);
  view.request.summary = row.body;
  view.commands.accept = { id: row.id, revision: row.revision, accepted: row.body };
  return view;
};
operations["notes.accept"] = async ({ id, revision, accepted }, sdk) => {
  await sdk.projectDatabase.transaction([
    { sql: "INSERT INTO fixture_review_audit VALUES (?)", parameters: [id] },
    { sql: "UPDATE fixture_review_notes SET accepted=? WHERE id=? AND revision=? AND accepted IS NULL", parameters: [accepted,id,revision], expected_changes: 1 }
  ]);
  if (id === "d") throw new Error("Presentation failed after the write");
  return true;
};`;
  });
}

test("APR-17/18 S-17 a signed sandbox package commits its review and project write together through real Web and management MCP", {
  skip: process.platform !== "darwin", timeout: 90_000,
}, async t => {
  let authorized = true;
  const env = await openTestHome(t, { assertAccountCurrent() {
    if (!authorized) throw new ActionError("actions.forbidden", "The original person lost access");
  } }), project = await env.createProject("Signed review");
  const pid = project.project_id, reference = project.reference, caller = person(pid), client = env.host.actionClient(reference);
  await removeGoals(env, pid);
  const { preview_id } = await client.invoke(caller, pluginInstallActions.preview, { bundle: signedNotesReview() }) as { preview_id: string };
  await client.invoke(caller, pluginInstallActions.confirm, { preview_id, consent: true, pin_label: "Signed fixture" });
  const active = await env.host.localPersonContext(reference);
  const entries = await env.host.inspectPreparedActionMetadata(active, reference);
  const row = entries.find(entry => entry.provider.plugin_id === PACKAGE_PLUGIN_ID && entry.action.local_id === "notes.accept");
  assert.ok(row);
  assert.equal(entries.some(entry => entry.provider.plugin_id === "io.molis.work.goals" && entry.provider.project_id === pid), false);
  const prefix = `/projects/${pid}/api`;
  for (const permission of ["project-database:read", "project-database:write"]) {
    await env.web.post(prefix + "/plugin-trust/permissions/set", { install_id: row.provider.plugin_install_id, permission, granted: true });
  }
  const action = { capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id };
  await env.host.withProject(reference, runtime => {
    runtime.store.db.exec("INSERT INTO fixture_review_notes VALUES ('a','Original text',1,NULL),('b','Was decided',1,'prior'),('c','Before permit',1,NULL),('d','After commit',1,NULL),('e','Receipt later',1,NULL)");
  });
  const webRead = (request_id: string) => env.web.post<ReviewRequest>(prefix + "/project-approvals/request", { action, request_id });
  const management = new LocalMcpServer(withCatalog, "management", null, {
    homeDirectory: env.home, runtimeContext: { runtime_id: "signed-review-fixture", stable_work_context_id: "signed-review", host_declares_stable: true },
  }, env.host, env.origin, async () => undefined);
  t.after(() => management.close());
  const decide = (review: ReviewRequest, request_key: string) => management.callTool("molis_work_v1_review_decide", {
    project_id: pid, database_path: project.database_path, reference: review.reference, choice_id: "accept", request_key,
  });
  await assert.rejects(client.invoke(active, action, offer.commands.accept), { code: "actions.forbidden" });
  const rejected = await webRead("b");
  await assert.rejects(decide(rejected, "invalid-business-rows"));
  const lastCheck = await webRead("c");
  const baseEmit = ChildProcess.prototype.emit;
  let readyForPermit = false;
  const request = { reference: lastCheck.reference, choice_id: "accept", request_key: "entry-closed-before-permit" };
  const interception = t.mock.method(ChildProcess.prototype, "emit", function (this: ChildProcess, event: string, ...args: unknown[]) {
    if (event === "message" && (args[0] as { ready_to_commit?: boolean } | undefined)?.ready_to_commit) {
      readyForPermit = true;
      authorized = false;
    }
    return Reflect.apply(baseEmit, this, [event, ...args]);
  });
  try {
    await assert.rejects(env.web.post(prefix + "/project-approvals/decide", request), { code: "actions.forbidden" });
  } finally { authorized = true; interception.mock.restore(); }
  assert.equal(readyForPermit, true, "the real writer prepared its changes and requested its final permit");
  const approved = await webRead("a");
  const { record } = JSON.parse(await decide(approved, "exact-choice")) as { record: ProjectTrustedDecision };
  assert.equal(record.source.entry.source, "management");
  const repeat = await env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(prefix + "/project-approvals/decide", {
    reference: approved.reference, choice_id: "accept", request_key: "exact-choice",
  });
  assert.deepEqual(repeat, { record, replayed: true });
  const late = await webRead("d");
  const recovered = JSON.parse(await decide(late, "lost-plugin-reply")) as { record: ProjectTrustedDecision; replayed: boolean };
  assert.equal(recovered.replayed, true);
  assert.equal(recovered.record.request_key, "lost-plugin-reply");
  const receiptLater = await webRead("e");
  const check = { reference: receiptLater.reference, choice_id: "accept", request_key: "lost-authority-after-permit" };
  let prepared: { child: ChildProcess; id: number } | undefined, lostReceipt = false;
  const afterPermit = t.mock.method(ChildProcess.prototype, "emit", function (this: ChildProcess, event: string, ...args: unknown[]) {
    const message = args[0] as { id?: number; ready_to_commit?: boolean; ok?: boolean } | undefined;
    if (event === "message" && typeof message?.id === "number") {
      if (message.ready_to_commit) prepared = { child: this, id: message.id };
      else if (prepared?.child === this && prepared.id === message.id && message.ok === true) {
        lostReceipt = true;
        authorized = false;
      }
    }
    return Reflect.apply(baseEmit, this, [event, ...args]);
  });
  try {
    await assert.rejects(env.web.post(prefix + "/project-approvals/decide", check), { code: "actions.outcome_unknown" });
  } finally { authorized = true; afterPermit.mock.restore(); }
  assert.equal(lostReceipt, true, "the original writer committed before the caller lost the ability to read its receipt");
  const checked = await env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(prefix + "/project-approvals/decide", check);
  assert.equal(checked.replayed, true);
  assert.equal(checked.record.request_key, check.request_key);
  await env.host.withProject(reference, runtime => {
    const { db } = runtime.store, history = projectReviewDecisions(db, pid);
    assert.deepEqual(db.prepare("SELECT id, accepted FROM fixture_review_notes ORDER BY id").all(),
      [{ id: "a", accepted: "Original text" }, { id: "b", accepted: "prior" }, { id: "c", accepted: null },
        { id: "d", accepted: "After commit" }, { id: "e", accepted: "Receipt later" }]);
    assert.deepEqual(db.prepare("SELECT id FROM fixture_review_audit ORDER BY id").all(), [{ id: "a" }, { id: "d" }, { id: "e" }]);
    assert.equal(history.forRequest(rejected.reference.id), null);
    assert.equal(history.forRequest(lastCheck.reference.id), null);
    assert.deepEqual(history.read(record.decision_id), record);
    assert.deepEqual(history.read(recovered.record.decision_id), recovered.record);
    assert.deepEqual(history.read(checked.record.decision_id), checked.record);
  });
});
