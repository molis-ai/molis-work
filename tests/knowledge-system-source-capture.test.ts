import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { artifactsActions, ARTIFACTS_PROVIDER_ID, type ArtifactImportResult } from "@molis-ai/molis-work-module-artifacts";
import { artifactSubjectId, type ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { actionSourceIdentity, isSearchEntriesSource, type ActionClient, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { searchSourceKey } from "@molis-ai/molis-work-contracts/services/search";
import { KnowledgeService, cardFor } from "@molis-ai/molis-work-service-knowledge";
import { readSubjectRetention } from "@molis-ai/molis-work-service-search";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { KNOWLEDGE_PROVIDER_ID, knowledgeManageActions } from "@molis-ai/molis-work-contracts/services/knowledge";

async function fixture(t: TestContext, personal = false) {
  const home = await mkdtemp(join(tmpdir(), "system-source-consumer-"));
  const projects = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => [
    await catalog.createProject({ display_name: "Current project", actor_id: "person" }),
    ...(personal ? [await catalog.ensurePersonalSpace()] : []),
  ]);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const cards = openKnowledgeCards({ homeDirectory: home });
  t.after(async () => { await host.close(); cards.close(); await rm(home, { recursive: true, force: true }); });
  const loaded: Array<{ project: typeof projects[number]; client: ActionClient; artifact: ArtifactImportResult; owner: ArtifactsApplicationApi }> = [];
  for (const project of projects) {
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const owner = await host.withProject(reference, runtime => runtime.artifacts), client = host.actionClient(reference);
    const caller = await host.localPersonContext(reference);
    const artifact = await client.invoke(caller, { ...artifactsActions.importFile, provider_id: ARTIFACTS_PROVIDER_ID },
      { source: "file", filename: "Source.txt", content: "Fixed source words before archive", title: project.display_name }) as ArtifactImportResult;
    loaded.push({ project, client, artifact, owner });
  }
  const main = loaded[0]!, reference = molisWorkHostProjectReference({ databasePath: main.project.database_path, projectId: main.project.project_id });
  const caller = await host.localPersonContext(reference), subject = { kind: "artifact", id: artifactSubjectId(main.artifact) };
  const views = await main.client.discover(caller), listing = views.find(view => view.provider.provider_id === ARTIFACTS_PROVIDER_ID && isSearchEntriesSource(view.action))!;
  const context = await main.client.invoke(caller, { ...artifactsActions.subject, provider_id: ARTIFACTS_PROVIDER_ID }, { subject_id: subject.id }) as ActionSubjectContext;
  cards.put(cardFor(main.project.project_id, { subject, source_key: searchSourceKey({ project_id: main.project.project_id,
    provider_id: listing.provider.provider_id, capability_id: listing.capability_id, version: listing.version }), provider_id: ARTIFACTS_PROVIDER_ID,
    plugin_id: ARTIFACTS_PROVIDER_ID, plugin_title: listing.provider.title, revision: context.revision, title: context.title, summary: "",
    content: context.content, content_policy: "context", updated_at: null, open: null,
    retention: { source_identity: actionSourceIdentity(listing.provider, main.project.project_id) } }));
  assert.ok(host.search);
  await host.search.service.rebuild({ client: main.client, caller }, { scope: "all" });
  let armed = false, insideFinal = false, readState = false, changed = false;
  const captureBatches: string[][] = [];
  const client: ActionClient = {
    discover: (value, filter) => main.client.discover(value, filter),
    invoke: async (value, action, input) => {
      const result = await main.client.invoke(value, action, input);
      if (action.capability_id === artifactsActions.retention.capability_id) readState = true;
      return result;
    },
    captureSources: scopes => {
      captureBatches.push(scopes.map(scope => scope.context.project_id!));
      const guard = main.client.captureSources!(scopes.map(scope => ({ ...scope, context: { ...scope.context,
        assert_authority_current: (action, permissions) => {
          scope.context.assert_authority_current?.(action, permissions);
          if (armed && insideFinal && readState && (!personal || scope.context.project_id === loaded[1]!.project.project_id)) {
            armed = false;
            main.owner.commands.archiveVersion({ project_id: main.project.project_id, artifact_id: main.artifact.artifact_id,
              version: main.artifact.version, actor_id: main.owner.query.getArtifactVersion(main.project.project_id, main.artifact)!.owner_actor_id });
            changed = true;
          }
        } } })));
      return () => { insideFinal = true; try { guard(); } finally { insideFinal = false; } };
    },
  };
  const access = { client, caller };
  const knowledge = new KnowledgeService({ cards, search: (current, input) => host.search!.service.query(current, input),
    retention: (current, identity, original) => readSubjectRetention(current, identity, original) });
  return { host, cards, subject, access, knowledge, caller, loaded, captureBatches, arm() { armed = true; readState = false; }, changed: () => changed };
}

for (const method of ["query", "list", "catalog", "tally", "read", "grep"] as const) {
  test(`MEM-SOURCE-CAPTURE ${method} denies a raw Artifact owner archive during final authority`, async t => {
    const f = await fixture(t); f.arm();
    const pending = method === "query" ? f.host.search!.service.query(f.access, { query: "Fixed", scope: "project" })
      : method === "list" ? f.knowledge.list(f.access, {})
      : method === "catalog" ? f.knowledge.catalog(f.caller.project_id!, await f.access.client.discover(f.caller), "Fixed", f.access)
      : method === "tally" ? f.knowledge.tally(f.caller.project_id!, await f.access.client.discover(f.caller), f.access)
      : method === "read" ? f.knowledge.read(f.access, { subject: f.subject })
      : f.knowledge.grep(f.access, { subjects: [f.subject], pattern: "Fixed" });
    if (method === "grep") {
      const result = await pending; assert.ok("matches" in result && "unread" in result);
      assert.deepEqual(result.matches, []); assert.deepEqual(result.found, []);
      assert.equal(result.unread.length, 1); assert.deepEqual(result.unread[0]!.subject, f.subject);
      assert.ok(result.unread[0]!.reason, "the named subject retains grep's explicit unread result");
    } else await assert.rejects(pending);
    assert.equal(f.changed(), true, "the real owner archive ran inside an actual Kernel authority callback");
    assert.ok(f.cards.get(f.caller.project_id!, f.subject), "temporary archive preserves the original card");
    assert.equal(f.cards.receipts(f.caller.project_id!, { limit: 20, offset: 0 }).total, 0);
  });
}

test("MEM-SOURCE-CAPTURE all-scope search batches the current project and personal space before returning either", async t => {
  const f = await fixture(t, true); f.arm();
  await assert.rejects(f.host.search!.service.query(f.access, { query: "Fixed", scope: "all" }));
  assert.equal(f.changed(), true);
  assert.ok(f.captureBatches.some(projects => projects.includes(f.loaded[0]!.project.project_id) && projects.includes(f.loaded[1]!.project.project_id)),
    "both source contexts are observed by one batch, so the later authority cannot change an earlier source unnoticed");
});

test("MEM-SOURCE-CAPTURE an Action client without system source capture cannot disclose retained data", async t => {
  const f = await fixture(t), client: ActionClient = { discover: context => f.access.client.discover(context), invoke: (...args) => f.access.client.invoke(...args) };
  await assert.rejects(f.host.search!.service.query({ client, caller: f.caller }, { query: "Fixed", scope: "project" }), { code: "actions.unavailable" });
  await assert.rejects(f.knowledge.list({ client, caller: f.caller }, {}));
  assert.equal(f.changed(), false);
});

for (const mutation of ["edit", "exclude"] as const) {
  test(`MEM-SOURCE-CAPTURE the pure card tail denies ${mutation} without reentering source authority`, async t => {
    const f = await fixture(t), main = f.loaded[0]!, project = main.project.project_id;
    let authorityCalls = 0;
    const caller = { ...f.caller, assert_authority_current: (...args: Parameters<NonNullable<typeof f.caller.assert_authority_current>>) => {
      authorityCalls++; f.caller.assert_authority_current?.(...args);
    } };
    const access = { ...f.access, caller }, views = await access.client.discover(caller);
    const prepared = await f.knowledge.catalog(project, views, "Fixed", access);
    assert.equal(prepared.pieces.length, 1);
    assert.ok(prepared.assertCardsCurrent); assert.ok(prepared.assertCurrent); assert.ok(prepared.beforeDispatch);
    await prepared.beforeDispatch(views);
    const source = main.owner.query.getArtifactVersion(project, main.artifact)!;
    await main.client.invoke(caller, { ...(mutation === "edit" ? knowledgeManageActions.edit : knowledgeManageActions.exclude), provider_id: KNOWLEDGE_PROVIDER_ID },
      mutation === "edit" ? { subject: f.subject, title: "本人更新的资料标题" } : { subject: f.subject, excluded: true });
    const beforePure = authorityCalls;
    assert.throws(() => prepared.assertCardsCurrent!());
    assert.equal(authorityCalls, beforePure, "the card-only check runs no availability/authority callback");
    assert.deepEqual(main.owner.query.getArtifactVersion(project, main.artifact), source, "the source itself did not change");
    assert.throws(() => prepared.assertCurrent!(), "the single guard still performs the same card denial after its source guard");
  });
}

for (const transition of ["archive", "unavailable"] as const) {
  test(`MEM-SOURCE-CAPTURE binding cannot commit after a raw owner ${transition} at its final authority callback`, async t => {
    const f = await fixture(t), main = f.loaded[0]!, project = main.project.project_id;
    const original = { ...f.cards.get(project, f.subject)!, retention: { source_identity: null, restoration_operation_id: null } };
    f.cards.put(original);
    const preview = await main.client.invoke(f.caller, { ...knowledgeManageActions.bindPreview, provider_id: KNOWLEDGE_PROVIDER_ID }, { subject: f.subject });
    assert.equal(preview.candidates.length, 1);
    const decision = () => ({ subject: f.subject, ...preview.candidates[0]!, operation_id: randomUUID() });
    const input = () => { const value = decision(); return { subject: value.subject, provider_id: value.provider_id, source_key: value.source_key,
      source_identity: value.source_identity, source_revision: value.source_revision, operation_id: value.operation_id }; };
    // Observe the public authority callback and persistent owner state; do not assume an implementation's check count.
    let beforeCommit = 0;
    await main.client.invoke({ ...f.caller, assert_authority_current: (action, permissions) => {
      f.caller.assert_authority_current?.(action, permissions);
      if (!f.cards.get(project, f.subject)!.adoption) beforeCommit++;
    } }, { ...knowledgeManageActions.bind, provider_id: KNOWLEDGE_PROVIDER_ID }, input());
    assert.ok(beforeCommit > 0);
    assert.ok(f.cards.get(project, f.subject)!.adoption);
    f.cards.put(original);
    let checks = 0, changed = false;
    const pending = main.client.invoke({ ...f.caller, assert_authority_current: (action, permissions) => {
      f.caller.assert_authority_current?.(action, permissions);
      if (changed || ++checks !== beforeCommit) return;
      assert.equal(f.cards.get(project, f.subject)!.adoption, undefined, "the competing owner write precedes binding");
      const mutation = { project_id: project, artifact_id: main.artifact.artifact_id, version: main.artifact.version,
        actor_id: main.owner.query.getArtifactVersion(project, main.artifact)!.owner_actor_id };
      if (transition === "archive") main.owner.commands.archiveVersion(mutation);
      else main.owner.commands.markUnavailable({ ...mutation, reason: "source withdrawn during binding" });
      changed = true;
    } }, { ...knowledgeManageActions.bind, provider_id: KNOWLEDGE_PROVIDER_ID }, input());
    await assert.rejects(pending);
    assert.equal(changed, true, "the real owner mutation ran at the observed pre-commit boundary");
    assert.deepEqual(f.cards.get(project, f.subject), original, "failed association preserves the entire retained card");
    const source = main.owner.query.getArtifactVersion(project, main.artifact)!;
    assert.equal(transition === "archive" ? source.lifecycle_state : source.availability, transition === "archive" ? "archived" : "unavailable");
  });
}

test("MEM-SOURCE-CAPTURE real PDF and summary Artifacts adopt through the Host and replay after an independent process restart", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "system-source-adoption-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = (stage: "adopt" | "reopen") => new Promise<{ pid: number; networkCalls: number }>((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("./fixtures/knowledge-system-adoption-process.mjs", import.meta.url).pathname, root, stage], {
      cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: { ...process.env, MOLIS_WORK_HOME: join(root, "home"), MOLIS_WORK_SECRET_BACKEND: "file" },
    });
    let errors = "", result: { pid: number; networkCalls: number } | undefined;
    child.stderr!.on("data", bytes => { errors = (errors + String(bytes)).slice(-8_000); });
    child.on("message", message => { result = message as typeof result; });
    child.on("error", reject);
    const stop = () => { child.kill("SIGTERM"); };
    t.signal.addEventListener("abort", stop, { once: true });
    child.on("exit", code => {
      t.signal.removeEventListener("abort", stop);
      if (code === 0 && result) resolve(result);
      else reject(new Error(`${stage} exited ${code}: ${errors}`));
    });
  });
  const adopted = await run("adopt"), reopened = await run("reopen");
  assert.notEqual(adopted.pid, reopened.pid);
  assert.equal(adopted.networkCalls, 0);
  assert.equal(reopened.networkCalls, 0);
});
