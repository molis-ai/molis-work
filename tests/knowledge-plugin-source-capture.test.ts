import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ActionError, actionSourceIdentity, isSearchEntriesSource, isSubjectReader, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, knowledgeManageActions, type KnowledgeCardRecord, type KnowledgeOrganizeResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

/** Reuse the frozen public Node Host decorator in an isolated child; no production module was loaded before its preload. */
async function isolated(t: TestContext, consumer: string, name: string): Promise<void> {
  const env = { ...process.env, MOLIS_WORK_TEST_PLUGIN_SOURCE_FINAL: consumer,
    MOLIS_WORK_TEST_SOURCE_FINAL_BOUNDARY: consumer === "assistant" ? "sdk" : "app" }; delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--no-warnings", "--unhandled-rejections=strict", "--experimental-test-module-mocks", "--import", "tsx",
    "--import", fileURLToPath(new URL("./fixtures/assistant-final-dispatch.mjs", import.meta.url)), "--test", "--test-isolation=none",
    "--test-concurrency=1", `--test-name-pattern=^${name}$`, fileURLToPath(import.meta.url)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exited = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
  const stop = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); };
  t.signal.addEventListener("abort", stop, { once: true }); t.after(async () => { stop(); await exited; });
  assert.equal(await exited, 0, stdout + stderr);
  assert.ok(stdout.includes(`PLUGIN_SOURCE_FINAL_DONE ${consumer}`), "the selected child finished the actual send refusal assertion");
}

test("MEM-SOURCE-CAPTURE Search rejects Coding public archive after the original asynchronous retention checks", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Coding search source", ["coding"]);
  const prefix = `/projects/${project.project_id}`, created = await home.web.post<{ session: { session_id: string } }>(
    prefix + "/api/plugins/io.molis.work.coding/sessions", { title: "RetainedCodingSource" });
  const subject = { kind: "coding_session", id: created.session.session_id }, base = home.host.actionClient(project.reference);
  const caller = await home.host.localPersonContext(project.reference), directory = await base.discover(caller);
  const source = directory.find(view => view.provider.plugin_id === "io.molis.work.coding" && isSearchEntriesSource(view.action))!;
  assert.ok(source); assert.equal(actionSourceIdentity(source.provider, project.project_id)?.kind, "plugin-installation");
  const update = directory.find(view => view.provider.provider_id === source.provider.provider_id && view.capability_id === "coding.sessions.update")!;
  assert.ok(update); assert.ok(home.host.search);
  await home.host.search.service.rebuild({ client: base, caller }, { scope: "project" });
  assert.ok((await home.host.search.service.query({ client: base, caller }, { query: "RetainedCodingSource", scope: "project" })).hits.length);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve()); t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  let captured = false, retainedRead = false, held = false;
  const client: ActionClient = {
    captureSources: scopes => {
      if (scopes.some(scope => scope.references.some(reference => reference.capability_id === source.capability_id && reference.provider_id === source.provider.provider_id))) captured = true;
      return base.captureSources!(scopes);
    },
    invoke: async (...args) => {
      const result = await base.invoke(...args);
      if (captured && args[1].capability_id === "coding.subject.retention") retainedRead = true;
      return result;
    },
    discover: async context => {
      const result = await base.discover(context);
      // Hold only after the real directory and retention decision finished; do not substitute either decision.
      if (captured && retainedRead && !held) { held = true; entered.resolve(); await release.promise; }
      return result;
    },
  };
  const pending = home.host.search.service.query({ client, caller }, { query: "RetainedCodingSource", scope: "project" });
  const rejected = assert.rejects(pending, { code: "actions.conflict" });
  void rejected.catch(() => {});
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Search returned before capturing the real plugin source"); })]);
    const sourcePath = `${prefix}/api/plugins/io.molis.work.coding/sessions/${subject.id}`;
    const preview = await home.web.get<{ archive_decision: unknown }>(sourcePath + "/archive-preview");
    await base.invoke(caller, { capability_id: update.capability_id, version: update.version, provider_id: update.provider.provider_id },
      { session_id: subject.id, archive: true, archive_decision: preview.archive_decision });
    release.resolve(); await rejected; assert.equal(held, true);
  } finally { release.resolve(); }
});

for (const consumer of ["assistant", "organize", "locate"] as const) {
  const boundary = consumer === "assistant" ? "SDK authorization" : "App network hook";
  const name = `MEM-SOURCE-CAPTURE ${consumer} refuses a same-generation Coding public archive during the final ${boundary} wait`;
  test(name, { timeout: 90_000 }, async t => {
    if (process.env.MOLIS_WORK_TEST_PLUGIN_SOURCE_FINAL !== consumer) return isolated(t, consumer, name);
    const { armAssistantFinalDispatch } = await import("./fixtures/assistant-final-dispatch.mjs");
    const home = await openTestHome(t), project = await home.createProject("Coding 资料发送", ["coding"]);
    const prefix = `/projects/${project.project_id}`, model = await connectorAssistantModel(t, home.home, () => "不得收到归档资料。");
    const created = await home.web.post<{ session: { session_id: string } }>(prefix + "/api/plugins/io.molis.work.coding/sessions", { title: "归档前的编码讨论" });
    const subject = { kind: "coding_session", id: created.session.session_id }, sourcePath = `${prefix}/api/plugins/io.molis.work.coding/sessions/${subject.id}`;
    const cards = openKnowledgeCards({ homeDirectory: home.home }); t.after(() => cards.close());
    await home.web.get(prefix + "/api/knowledge/overview");
    await untilSetup(async () => {
      const states = await home.web.get<{ states: Array<{ kind: string; id: string; state: string }>; listing: boolean }>(prefix + "/api/knowledge/states");
      const card = cards.get(project.project_id, subject);
      return !states.listing && card?.state === "ready" && card.organized_revision === card.revision ? card : undefined;
    }, "the real Coding source has a nonempty organized card before the final-send barrier is armed");
    const original = cards.get(project.project_id, subject)!;
    assert.ok(original.retention?.source_identity?.kind === "plugin-installation");
    const client = home.host.actionClient(project.reference), caller = await home.host.localPersonContext(project.reference);
    const views = await client.discover(caller), source = views.find(view => view.provider.plugin_id === "io.molis.work.coding" && isSearchEntriesSource(view.action))!;
    assert.ok(source); const generation = actionSourceIdentity(source.provider, project.project_id);
    assert.equal(generation?.kind, "plugin-installation");
    const archiveAction = views.find(view => view.provider.provider_id === source.provider.provider_id && view.capability_id === "coding.sessions.update")!;
    assert.ok(archiveAction); assert.equal(archiveAction.operation, "command");
    const archive = async () => {
      const preview = await home.web.get<{ archive_decision: unknown }>(sourcePath + "/archive-preview");
      await client.invoke(caller, { capability_id: archiveAction.capability_id, version: archiveAction.version, provider_id: archiveAction.provider.provider_id },
        { session_id: subject.id, archive: true, archive_decision: preview.archive_decision });
      assert.equal((await home.web.get<{ session: { archived: boolean } }>(sourcePath)).session.archived, true);
      const current = (await client.discover(caller)).find(view => view.capability_id === source.capability_id && view.provider.provider_id === source.provider.provider_id)!;
      assert.deepEqual(actionSourceIdentity(current.provider, project.project_id), generation, "the exact same running plugin generation performed the public archive");
    };
    let materialChecks = 0;
    if (consumer === "assistant") {
      const search = home.host.search!, catalog = search.knowledgeCatalog.bind(search);
      t.after(() => { search.knowledgeCatalog = catalog; });
      search.knowledgeCatalog = async (...args) => {
        const result = await catalog(...args);
        if (!result?.pieces.length) return result;
        return { ...result, beforeDispatch: async current => { await result.beforeDispatch?.(current); materialChecks++; } };
      };
    }
    const network = armAssistantFinalDispatch(), beforeTraffic = model.transportRequests.length;
    t.after(network.release); t.signal.addEventListener("abort", network.release, { once: true });
    let end: Promise<unknown>, sent: AssistantSendResult | undefined, locateFailure: Error | undefined;
    try {
      if (consumer === "assistant") {
        const pending = home.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "归档前的编码讨论是什么？", request_id: crypto.randomUUID() });
        [sent] = await Promise.all([pending, network.entered]); assert.equal(sent.outcome, "started");
        assert.ok(materialChecks > 0, "the original asynchronous source checks passed before the SDK wait");
        end = untilSetup(async () => {
          const result = await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent!.work.work_id}`);
          return result.work.state === "failed" && result.rounds.at(-1)?.phase === "failed" ? result : undefined;
        }, "the actual Assistant round fails at its final source fence");
      } else if (consumer === "organize") {
        const queued = await home.web.post<KnowledgeOrganizeResponse>(prefix + "/api/knowledge/organize", { subjects: [subject] });
        assert.equal(queued.queued, 1); await network.entered;
        end = untilSetup(async () => {
          const card = cards.get(project.project_id, subject);
          return card?.state === "failed" ? card : undefined;
        }, "the explicit organizing attempt records the send refusal without applying a model result");
      } else {
        const pending = client.invoke(caller, { ...knowledgeActions.locate, provider_id: KNOWLEDGE_PROVIDER_ID }, { question: "编码讨论有什么内容？", subjects: [subject] });
        end = assert.rejects(pending, error => {
          if (!(error instanceof Error) || !error.message.trim()) return false;
          locateFailure = error; return true;
        }); void end.catch(() => {});
        await Promise.race([network.entered, pending.then(() => { throw new Error("Locate returned before reaching its real final App hook wait"); })]);
      }
      void end.catch(() => {});
      assert.equal(network.observed().prepared, 1); assert.equal(network.observed().holds, 1);
      assert.equal(model.transportRequests.length, beforeTraffic);
      const cardBeforeArchive = cards.get(project.project_id, subject)!;
      const asyncChecks = materialChecks;
      await archive();
      assert.deepEqual(cards.get(project.project_id, subject), cardBeforeArchive, "the public archive did not reconcile or change the existing Knowledge card");
      network.release(); const ended = await end;
      const observed = network.observed();
      assert.ok(observed.failure && typeof observed.failure === "object" && "code" in observed.failure);
      assert.equal(observed.failure.code, "EFFECT_NOT_AUTHORIZED");
      assert.deepEqual(observed.refusalInspection, { status: "failed", dispatched: false, retryable: false, retryAfterMs: undefined });
      if (consumer === "assistant") {
        assert.equal(observed.boundary, "sdk"); assert.equal(observed.sdkAuthorizationPresent, true); assert.ok(observed.fenceCalls > 0);
        assert.ok(observed.cancelCalls > 0, "Agent terminal cleanup really cancels this same refused handle");
        assert.deepEqual(await network.inspect(), { status: "cancelled", dispatched: false, retryable: false, retryAfterMs: undefined });
        const failed = ended as AssistantWorkView;
        assert.equal(failed.work.state, "failed"); assert.equal(failed.rounds.at(-1)?.run_id, sent!.run_id);
        assert.equal(failed.rounds.at(-1)?.phase, "failed"); assert.ok(failed.rounds.at(-1)?.stop_reason?.trim());
      } else {
        assert.equal(observed.boundary, "app"); assert.equal(observed.sdkAuthorizationPresent, false); assert.equal(observed.fenceCalls, 0);
        assert.ok(observed.appFenceCalls > 0, "the bounded consumer's original App source fence refuses after its hook await");
        assert.equal(observed.cancelCalls, 0, "bounded Session failure/archive does not use Agent network cleanup");
        assert.deepEqual(await network.inspect(), { status: "failed", dispatched: false, retryable: false, retryAfterMs: undefined });
        if (consumer === "organize") { const failed = ended as KnowledgeCardRecord; assert.equal(failed.state, "failed"); assert.ok(failed.error?.trim()); }
        else assert.ok(locateFailure?.message.trim(), "Locate exposes its real source refusal");
      }
      assert.equal(model.transportRequests.length, beforeTraffic, "no actual request or retry with the archived source reached the loopback model");
      if (consumer === "assistant") assert.equal(materialChecks, asyncChecks, "the late denial came from the synchronous source fence, not another async material check");
      const final = cards.get(project.project_id, subject)!;
      assert.deepEqual([final.title, final.brief, final.edited, final.retention], [original.title, original.brief, original.edited, original.retention]);
      if (consumer !== "organize") assert.deepEqual(final, original);
      else assert.equal(final.organized_revision, null, "the explicitly queued attempt did not apply a fresh model result");
      process.stdout.write(`PLUGIN_SOURCE_FINAL_DONE ${consumer}\n`);
    } finally { network.release(); }
  });
}


for (const method of ["organize", "locate"] as const) for (const mutation of ["exclude", "edit"] as const) {
  const name = `MEM-SOURCE-CARD ${method} denies ${mutation} during the Node Host App hook wait with the original source unchanged`;
  const child = `card-${method}-${mutation}`;
  test(name, { timeout: 60_000 }, async t => {
    if (process.env.MOLIS_WORK_TEST_PLUGIN_SOURCE_FINAL !== child) return isolated(t, child, name);
    const { armAssistantFinalDispatch } = await import("./fixtures/assistant-final-dispatch.mjs");
    const home = await openTestHome(t), project = await home.createProject("本人修改发送中的资料卡", ["coding"]);
    const prefix = `/projects/${project.project_id}`, model = await connectorAssistantModel(t, home.home, () => "不得收到旧卡材料。");
    const created = await home.web.post<{ session: { session_id: string } }>(prefix + "/api/plugins/io.molis.work.coding/sessions", { title: "修改卡片前的编码讨论" });
    const subject = { kind: "coding_session", id: created.session.session_id };
    const cards = openKnowledgeCards({ homeDirectory: home.home }); t.after(() => cards.close());
    await home.web.get(prefix + "/api/knowledge/overview");
    await untilSetup(async () => {
      const states = await home.web.get<{ listing: boolean }>(prefix + "/api/knowledge/states"), card = cards.get(project.project_id, subject);
      return !states.listing && card?.state === "ready" && card.organized_revision === card.revision ? card : undefined;
    }, "the actual Host organized this source before the final card-change barrier is armed");
    const client = home.host.actionClient(project.reference), caller = await home.host.localPersonContext(project.reference);
    const views = await client.discover(caller), source = views.find(view => view.provider.plugin_id === "io.molis.work.coding" && isSearchEntriesSource(view.action))!;
    assert.ok(source);
    const sourceIdentity = actionSourceIdentity(source.provider, project.project_id); assert.equal(sourceIdentity?.kind, "plugin-installation");
    const reader = views.find(view => view.provider.provider_id === source.provider.provider_id && isSubjectReader(view.action) && view.action.subject_kinds.includes(subject.kind))!;
    assert.ok(reader);
    const reference = { provider_id: reader.provider.provider_id, capability_id: reader.capability_id, version: reader.version };
    const sourceBefore = await client.invoke(caller, reference, { subject_id: subject.id });
    const network = armAssistantFinalDispatch(), beforeTraffic = model.transportRequests.length;
    t.after(network.release); t.signal.addEventListener("abort", network.release, { once: true });
    let located: Promise<void> | undefined;
    try {
      if (method === "organize") {
        const queued = await home.web.post<KnowledgeOrganizeResponse>(prefix + "/api/knowledge/organize", { subjects: [subject] });
        assert.equal(queued.queued, 1); await network.entered;
      } else {
        const pending = client.invoke(caller, { ...knowledgeActions.locate, provider_id: KNOWLEDGE_PROVIDER_ID }, { question: "编码讨论有哪些章节？", subjects: [subject] });
        located = assert.rejects(pending, error => {
          assert.ok(error instanceof ActionError); assert.equal(error.code, "knowledge.unreadable"); return true;
        }); void located.catch(() => {});
        await Promise.race([network.entered, pending.then(() => { throw new Error("Locate returned before its original App hook wait"); })]);
      }
      const prepared = network.observed();
      assert.equal(prepared.boundary, "app"); assert.equal(prepared.sdkAuthorizationPresent, false);
      assert.equal(prepared.prepared, 1); assert.equal(prepared.holds, 1); assert.equal(prepared.fenceCalls, 0);
      assert.equal(model.transportRequests.length, beforeTraffic);
      const changed = await client.invoke(caller, { ...(mutation === "edit" ? knowledgeManageActions.edit : knowledgeManageActions.exclude), provider_id: KNOWLEDGE_PROVIDER_ID },
        mutation === "edit" ? { subject, title: "Human title after material preparation", brief: "Human brief after material preparation" } : { subject, excluded: true }) as KnowledgeCardRecord;
      assert.deepEqual(cards.get(project.project_id, subject), changed);
      if (mutation === "edit") { assert.ok(changed.edited.includes("title")); assert.ok(changed.edited.includes("brief")); }
      else assert.equal(changed.excluded, true);
      assert.deepEqual(await client.invoke(caller, reference, { subject_id: subject.id }), sourceBefore, "the source body and version remain exactly the original owner's");
      const currentSource = (await client.discover(caller)).find(view => view.provider.provider_id === source.provider.provider_id && view.capability_id === source.capability_id)!;
      assert.ok(currentSource); assert.deepEqual(actionSourceIdentity(currentSource.provider, project.project_id), sourceIdentity);
      network.release();
      const refused = await untilSetup(async () => { const current = network.observed(); return current.failure && current.refusalInspection ? current : undefined; },
        "the actual bounded model handle refuses the changed original card");
      if (located) await located;
      assert.ok(refused.failure && typeof refused.failure === "object" && "code" in refused.failure);
      assert.equal(refused.failure.code, "EFFECT_NOT_AUTHORIZED"); assert.ok(refused.appFenceCalls > 0);
      assert.equal(refused.cancelCalls, 0, "the observed refusal precedes consumer shutdown and is not Agent cancellation");
      assert.deepEqual(refused.refusalInspection, { status: "failed", dispatched: false, retryable: false, retryAfterMs: undefined });
      assert.deepEqual(await network.inspect(), { status: "failed", dispatched: false, retryable: false, retryAfterMs: undefined });
      assert.equal(model.transportRequests.length, beforeTraffic, "no raw HTTP request or retry with the original card reached the provider");
      // Refusal is established above. The owning Host drains background work and records its completed shutdown steps.
      // This proves shutdown preservation, without pretending that the Host exposes a natural organizer-settlement join.
      await home.host.close();
      assert.deepEqual(cards.get(project.project_id, subject), changed, "the original human decision survives the owning Host's shutdown without a stale result or failure write");
      assert.equal(model.transportRequests.length, beforeTraffic);
      assert.equal(cards.receipts(project.project_id, { limit: 20, offset: 0 }).total, 0);
      process.stdout.write(`PLUGIN_SOURCE_FINAL_DONE ${child}\n`);
    } finally { network.release(); }
  });
}
