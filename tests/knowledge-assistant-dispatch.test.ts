import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureSystemAgentService, molisWorkHostProjectReference, withConnectorConnections, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { openKnowledgeCards, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { isKnowledgeOrganize, organizedCardFor } from "./fixtures/knowledge-organize.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

// Original red evidence is retained in the frozen handoff. This exercises the same real dispatch boundary.
// Real Coding HTTP/Action owner, real Assistant HTTP/service, one real Node SDK runtime and loopback SSE transport.
test("A4-K selected Assistant knowledge must not reach a new provider request after its real Coding owner archives", { timeout: 90_000 }, async t => {
  const f = await codingProductHost(t, () => { throw new Error("the old non-loopback provider must not be used"); });
  const host: MolisWorkLocalHost = f.host, title = "A4_DISPATCH_UNIQUE_TITLE_20261104", brief = "A4_DISPATCH_UNIQUE_BRIEF_20261104";
  const received: Array<{ raw: string; organize: boolean; at: number }> = [], trace: Array<{ step: string; at: number }> = [];
  let requestToolOnce = false;
  const provider = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), organize = isKnowledgeOrganize(raw);
    received.push({ raw, organize, at: performance.now() });
    const answer = organize ? organizedCardFor(raw) : endingReviewAnswer(JSON.parse(raw), () => []) ?? "已完成。";
    const tool = !organize && requestToolOnce;
    if (tool) requestToolOnce = false;
    const output = tool ? cogniaScriptedResponse({ name: "read-capability", input: { capability_id: knowledgeActions.list.capability_id, version: knowledgeActions.list.version, provider_id: "system.knowledge", input: {} } }) : cogniaModelResponse(answer);
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await output.text());
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(async () => { provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });
  const address = provider.address(); assert.ok(address && typeof address === "object"); const endpoint = `http://127.0.0.1:${address.port}`;
  const withCatalog = host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
  await runWithMolisWorkHome(f.home, () => withCatalog({ homeDirectory: f.home }, catalog => {
    const connection = withConnectorConnections(f.home, store => {
      const row = store.createToken({ serviceId: "model-api", displayName: "A4 loopback", token: "fixture-loopback-only" });
      store.assertTarget(row.connection_id, "model-api", endpoint); return row;
    });
    catalog.models.upsert({ provider_id: "fixture", display_name: "A4 real loopback", base_url: endpoint, api_format: "anthropic-messages", credential_ref: connection.credential_ref!, models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  const project = f.project.project_id, prefix = `/projects/${project}`, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "普通来源工作" }); assert.equal(created.status, 200);
  const id = created.body.session.session_id, subject = { kind: "coding_session", id };
  const started = await f.call<{ run: { ref: AgentRunRef } }>(project, `${coding}/sessions/${id}/runs`, { task: "只生成普通回执", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200); assert.equal((await f.ended(started.body.run.ref)).phase, "completed"); await f.call(project, coding + "/state");
  const reference = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path }), client = host.actionClient(reference);
  const person = await host.localPersonContext(reference), views = await client.discover(person);
  const reader = views.find(view => view.capability_id === "coding.subject.read")!, update = views.find(view => view.capability_id === "coding.sessions.update")!, state = views.find(view => view.capability_id === "coding.subject.state")!;
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  await untilSetup(async () => {
    await client.invoke(person, knowledgeActions.list, {}); const context = await client.invoke(person, reader, { subject_id: id }) as ActionSubjectContext;
    const card = cards.get(project, subject); return card?.state === "ready" && card.organized_revision === context.revision ? true : undefined;
  }, "the real Coding material has a ready content-version card", 20_000);
  await f.web.post(prefix + "/api/knowledge/edit", { subject, title, brief });
  const complete = async (workId: string) => untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${workId}`); return view.work.state === "completed" ? true : undefined; }, "Assistant reaches its normal terminal result", 20_000);
  const agentHost = ensureSystemAgentService(host, f.home).agentHost, originalStart = agentHost.start.bind(agentHost);
  const lifecycle = agentHost.adapter("prologue").sessionLifecycle!, originalObserve = lifecycle.observeWrites!.bind(lifecycle);
  let liveObservations = 0, acquiredObservations = 0, releasedObservations = 0;
  t.mock.method(lifecycle, "observeWrites", (sessions: Parameters<typeof originalObserve>[0]) => {
    const held = originalObserve(sessions); let disposed = false;
    liveObservations++; acquiredObservations++;
    return { assert_current: held.assert_current, dispose: () => { if (!disposed) { disposed = true; liveObservations--; releasedObservations++; held.dispose(); } } };
  });
  const originalCard = cards.get(project, subject)!;
  const positiveAt = received.length;
  const control = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "正控制：查看项目资料", request_id: crypto.randomUUID() }); await complete(control.work.work_id);
  const positive = received.slice(positiveAt).filter(row => !row.organize);
  assert.ok(positive.some(row => row.raw.includes(title) && row.raw.includes(brief)), "positive control actually sends both selected markers to the loopback provider");
  assert.equal(liveObservations, 0, "a completed real Run releases without an external Run subscription");
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let armed = true;
  t.mock.method(agentHost, "start", async (...args: Parameters<typeof originalStart>) => {
    const material = JSON.stringify(args[1].text_materials ?? []);
    if (armed && material.includes(title) && material.includes(brief)) {
      armed = false; trace.push({ step: "selected-materials-before-original-start", at: performance.now() }); reached.resolve(); await release.promise;
    }
    return originalStart(...args);
  });
  const negativeAt = received.length;
  const sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "交错：查看项目资料", request_id: crypto.randomUUID() });
  try {
    const selected = await Promise.race([reached.promise.then(() => true), sending.then(() => false)]);
    assert.equal(selected, true, "the real Assistant selected the unique card before starting its model run");
    await client.invoke(await host.localPersonContext(reference), update, { session_id: id, archive: true });
    assert.deepEqual(await client.invoke(await host.localPersonContext(reference), state, { subject_id: id }), { subject, state: "archived" });
    trace.push({ step: "real-business-owner-archive-completed", at: performance.now() });
    release.resolve(); const sent = await sending;
    const failed = await untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`); return view.work.state === "failed" ? view : undefined; }, "Assistant publishes the source dispatch refusal", 20_000);
    const actual = await agentHost.adapter("prologue").read({ runtime_id: "prologue", session_id: failed.work.session_id!, run_id: failed.rounds.at(-1)!.run_id });
    assert.match(JSON.stringify(actual), /EFFECT_NOT_AUTHORIZED|knowledge.source_changed|所选项目资料当前不可用于本轮/);
    const negative = received.slice(negativeAt).filter(row => !row.organize), leaked = negative.filter(row => row.raw.includes(title) && row.raw.includes(brief));
    const archivedAt = trace.find(row => row.step === "real-business-owner-archive-completed")!.at;
    assert.equal(actual.phase, "failed", "the actual accepted Run fails at source dispatch authorization");
    assert.equal(negative.length, 0, "no new non-organizer Provider request after the formal two-owner archive");
    assert.ok(negative.every(row => row.at > archivedAt), "the observed new provider requests happen after the owner archive completes");
    t.diagnostic("A4_DISPATCH_OBSERVATION " + JSON.stringify({ phase: "business-and-SDK-owner-after-L", positiveRequests: positive.length, positiveMarkers: true, negativeRequests: negative.length, negativeWithArchivedMarkers: leaked.length, trace }));
    assert.equal(leaked.length, 0, "the new provider request must not carry a now-archived card's title and brief");
    assert.equal(liveObservations, 0, "the refused real Run releases selected source observations");
    const sameWorkAt = received.length;
    const followup = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { work_id: control.work.work_id, text: "新明确一轮：只处理当前材料", request_id: crypto.randomUUID() });
    await complete(followup.work.work_id);
    const followupRequests = received.slice(sameWorkAt).filter(row => !row.organize);
    assert.ok(followupRequests.length > 0);
    assert.ok(followupRequests.every(row => !row.raw.includes(title) && !row.raw.includes(brief)), "a new explicit Run of the same Assistant does not reintroduce its old archived catalog through opening history");
    const organizeBeforeRestore = received.filter(row => row.organize).length;
    const restore = async () => {
      await client.invoke(await host.localPersonContext(reference), update, { session_id: id, archive: false });
      await untilSetup(async () => { await client.invoke(await host.localPersonContext(reference), knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "same-content source returns to its retained ready card", 20_000);
      const card = cards.get(project, subject)!;
      assert.equal(card.revision, originalCard.revision); assert.equal(card.organized_revision, originalCard.organized_revision);
      assert.equal(card.title, title); assert.equal(card.brief, brief);
      assert.equal(received.filter(row => row.organize).length, organizeBeforeRestore, "restore never calls the organizer for unchanged content");
    };
    await restore();
    const terminal = async (workId: string) => untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${workId}`); return view.work.state === "failed" ? view : undefined; }, "source dispatch refusal is published", 20_000);
    for (const scenario of ["final-await", "second-dispatch", "archive-restore-after-observe", "excluded-after-observe", "ordinary-card-edit"] as const) {
      let gated = false;
      requestToolOnce = scenario === "second-dispatch";
      const selected = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
      t.mock.method(agentHost, "start", async (...args: Parameters<typeof originalStart>) => {
        const hasMarkers = JSON.stringify(args[1].text_materials ?? []).includes(title), original = args[2].beforeDispatch;
        return originalStart(args[0], args[1], { ...args[2], beforeDispatch: async () => {
          const fence = await original?.();
          if (hasMarkers && !gated && (scenario !== "second-dispatch" || received.slice(at).some(row => !row.organize))) { gated = true; selected.resolve(); await gate.promise; }
          return fence;
        } });
      });
      const at = received.length, sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: `资料派发 ${scenario}`, request_id: crypto.randomUUID() });
      try {
        await selected.promise;
        if (scenario === "excluded-after-observe") await f.web.post(prefix + "/api/knowledge/exclude", { subject, excluded: true });
        else if (scenario === "ordinary-card-edit") await f.web.post(prefix + "/api/knowledge/edit", { subject, title: "本人稍后改的新标题", brief: "本人稍后改的新简介" });
        else await client.invoke(await host.localPersonContext(reference), update, { session_id: id, archive: true });
        if (scenario === "archive-restore-after-observe") await client.invoke(await host.localPersonContext(reference), update, { session_id: id, archive: false });
        gate.resolve(); const sent = await sending;
        if (scenario === "ordinary-card-edit") {
          await complete(sent.work.work_id);
          const requests = received.slice(at).filter(row => !row.organize);
          assert.ok(requests.some(row => row.raw.includes(title) && row.raw.includes(brief)), "ordinary card edits preserve the selected title/brief snapshot");
          assert.equal(liveObservations, 0);
          continue;
        }
        const failed = await terminal(sent.work.work_id);
        const actual = await agentHost.adapter("prologue").read({ runtime_id: "prologue", session_id: failed.work.session_id!, run_id: failed.rounds.at(-1)!.run_id });
        assert.match(JSON.stringify(actual), /EFFECT_NOT_AUTHORIZED|knowledge.source_changed|所选项目资料当前不可用于本轮/);
        const requests = received.slice(at).filter(row => !row.organize);
        assert.equal(requests.length, scenario === "second-dispatch" ? 1 : 0, scenario + " blocks precisely the new dispatch");
        if (scenario === "second-dispatch") assert.ok(requests[0]!.raw.includes(title) && requests[0]!.raw.includes(brief), "the first actual request remains sent");
        assert.equal(liveObservations, 0);
        t.diagnostic("A4_DISPATCH_FENCE " + JSON.stringify({ scenario, requests: requests.length, actual: actual.phase }));
      } finally {
        gate.resolve(); await sending.catch(() => undefined);
        if (scenario === "excluded-after-observe") await f.web.post(prefix + "/api/knowledge/exclude", { subject, excluded: false });
        if (scenario === "ordinary-card-edit") await f.web.post(prefix + "/api/knowledge/edit", { subject, title, brief });
      }
      await restore();
    }
    t.mock.method(agentHost, "start", originalStart);
    const recoveredAt = received.length;
    const recovered = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "恢复完成后的新明确请求", request_id: crypto.randomUUID() }); await complete(recovered.work.work_id);
    assert.ok(received.slice(recoveredAt).filter(row => !row.organize).some(row => row.raw.includes(title) && row.raw.includes(brief)), "a fresh review after explicit restore may use the original catalog snapshot");
    assert.equal(acquiredObservations, releasedObservations); assert.equal(liveObservations, 0);
    t.diagnostic("A4_DISPATCH_RELEASE " + JSON.stringify({ acquiredObservations, releasedObservations, unchangedContentOrganizerCalls: received.filter(row => row.organize).length - organizeBeforeRestore }));
  } finally { release.resolve(); await sending.catch(() => undefined); }
});

test("A4-K a real unbound Coding draft archives after selection and blocks dispatch without creating its SDK Session", { timeout: 90_000 }, async t => {
  const f = await codingProductHost(t, request => cogniaModelResponse(endingReviewAnswer(request, () => []) ?? "完成。"), { loopbackProvider: true });
  const project = f.project.project_id, prefix = `/projects/${project}`, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string; runtime_session_id: string | null } }>(project, coding + "/sessions", { title: "未运行的真实草稿" });
  assert.equal(created.status, 200); assert.equal(created.body.session.runtime_session_id, null);
  const subject = { kind: "coding_session", id: created.body.session.session_id }, title = "A4_DRAFT_SELECTED_TITLE", brief = "A4_DRAFT_SELECTED_BRIEF";
  const reference = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path }), client = f.host.actionClient(reference);
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  await untilSetup(async () => { await client.invoke(await f.host.localPersonContext(reference), knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "draft has a real retained card", 20_000);
  await f.web.post(prefix + "/api/knowledge/edit", { subject, title, brief });
  const agentHost = ensureSystemAgentService(f.host, f.home).agentHost, originalStart = agentHost.start.bind(agentHost), lifecycle = agentHost.adapter("prologue").sessionLifecycle!, originalObserve = lifecycle.observeWrites!.bind(lifecycle);
  let observations = 0;
  t.mock.method(lifecycle, "observeWrites", (...args: Parameters<typeof originalObserve>) => { observations++; return originalObserve(...args); });
  const selected = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.mock.method(agentHost, "start", async (...args: Parameters<typeof originalStart>) => {
    if (JSON.stringify(args[1].text_materials ?? []).includes(title)) { selected.resolve(); await release.promise; }
    return originalStart(...args);
  });
  const at = f.requests.length, sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "看这份草稿资料", request_id: crypto.randomUUID() });
  try {
    await selected.promise;
    await client.invoke(await f.host.localPersonContext(reference), { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: subject.id, archive: true });
    release.resolve(); const sent = await sending;
    const failed = await untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`); return view.work.state === "failed" ? view : undefined; }, "draft dispatch refuses explicitly", 20_000);
    const run = await agentHost.adapter("prologue").read({ runtime_id: "prologue", session_id: failed.work.session_id!, run_id: failed.rounds.at(-1)!.run_id });
    assert.match(JSON.stringify(run), /EFFECT_NOT_AUTHORIZED|knowledge.source_changed|所选项目资料当前不可用于本轮/);
    assert.equal(f.requests.length, at); assert.equal(observations, 0);
    const owner = await f.call<{ session: { runtime_session_id: string | null; archived: boolean } }>(project, coding + `/sessions/${subject.id}`);
    assert.equal(owner.body.session.runtime_session_id, null); assert.equal(owner.body.session.archived, true);
    await client.invoke(await f.host.localPersonContext(reference), { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: subject.id, archive: false });
    await untilSetup(async () => { await client.invoke(await f.host.localPersonContext(reference), knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "restored draft is selectable", 20_000);
    const selectedAgain = Promise.withResolvers<void>(), releaseAgain = Promise.withResolvers<void>(); let heldAgain = false;
    t.after(() => releaseAgain.resolve());
    t.mock.method(agentHost, "start", async (...args: Parameters<typeof originalStart>) => {
      const selected = JSON.stringify(args[1].text_materials ?? []).includes(title), original = args[2].beforeDispatch;
      return originalStart(args[0], args[1], { ...args[2], beforeDispatch: async () => {
        const fence = await original?.();
        if (selected && !heldAgain) { heldAgain = true; selectedAgain.resolve(); await releaseAgain.promise; }
        return fence;
      } });
    });
    const selecting = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "选择尚无SDK映射的草稿", request_id: crypto.randomUUID() });
    try {
      await selectedAgain.promise;
      let accepted: AssistantSendResult | undefined;
      void selecting.then(value => { accepted = value; });
      await untilSetup(async () => accepted, "the selected Assistant Run is accepted before another real owner Run begins", 20_000);
      const bound = await f.call<{ run: { ref: AgentRunRef } }>(project, `${coding}/sessions/${subject.id}/runs`, { task: "真实首次执行绑定", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
      assert.equal(bound.status, 200); assert.equal((await f.ended(bound.body.run.ref)).phase, "completed"); await f.call(project, coding + "/state");
      const beforeOldSelectionDispatch = f.requests.length;
      releaseAgain.resolve(); const sent = await selecting;
      await untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`); return view.work.state === "failed" ? true : undefined; }, "old null mapping is refused after real canonical binding", 20_000);
      assert.equal(f.requests.length, beforeOldSelectionDispatch, "the old selection cannot acquire the newly bound Session identity");
      assert.equal(observations, 0, "mapping mismatch is refused before acquiring SDK observations");
    } finally { releaseAgain.resolve(); await selecting.catch(() => undefined); }
  } finally { release.resolve(); await sending.catch(() => undefined); }
});

test("A4-K bounded multi-source checks preserve unrelated owners and release on start refusal, cancel and close", { timeout: 90_000 }, async t => {
  let providerGate: { reached: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> } | undefined;
  const f = await codingProductHost(t, async request => {
    const held = providerGate;
    if (held) { held.reached.resolve(); await held.release.promise; }
    return cogniaModelResponse(endingReviewAnswer(request, () => []) ?? "完成。");
  }, { loopbackProvider: true });
  const project = f.project.project_id, prefix = `/projects/${project}`, coding = "/api/plugins/io.molis.work.coding";
  const reference = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path }), client = f.host.actionClient(reference);
  const made: Array<{ id: string; session: { runtime_id: string; session_id: string }; marker: string }> = [];
  for (const marker of ["A4_MULTI_SOURCE_FIRST", "A4_MULTI_SOURCE_SECOND"]) {
    const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: marker });
    const id = created.body.session.session_id;
    const started = await f.call<{ run: { ref: AgentRunRef } }>(project, `${coding}/sessions/${id}/runs`, { task: "普通来源内容", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
    assert.equal(started.status, 200); assert.equal((await f.ended(started.body.run.ref)).phase, "completed"); await f.call(project, coding + "/state");
    made.push({ id, marker, session: { runtime_id: started.body.run.ref.runtime_id, session_id: started.body.run.ref.session_id } });
  }
  const other = await f.call<{ session: { session_id: string } }>(f.other.project_id, coding + "/sessions", { title: "未选中的另一项目C" }); assert.equal(other.status, 200);
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  const stable = async () => untilSetup(async () => { await client.invoke(await f.host.localPersonContext(reference), knowledgeActions.list, {}); return made.every(row => cards.get(project, { kind: "coding_session", id: row.id })?.state === "ready") ? true : undefined; }, "both selected source cards are current", 20_000);
  await stable();
  for (const row of made) await f.web.post(prefix + "/api/knowledge/edit", { subject: { kind: "coding_session", id: row.id }, title: row.marker, brief: row.marker + "_BRIEF" });
  const host = ensureSystemAgentService(f.host, f.home).agentHost, adapter = host.adapter("prologue"), lifecycle = adapter.sessionLifecycle!, originalRead = lifecycle.read.bind(lifecycle), originalObserve = lifecycle.observeWrites!.bind(lifecycle), originalStart = host.start.bind(host);
  let live = 0, disposed = 0;
  t.mock.method(lifecycle, "observeWrites", (...args: Parameters<typeof originalObserve>) => {
    const held = originalObserve(...args); let closed = false; live++;
    return { assert_current: held.assert_current, dispose: () => { if (!closed) { closed = true; live--; disposed++; held.dispose(); } } };
  });
  const archive = async (id: string, value: boolean) => client.invoke(await f.host.localPersonContext(reference), { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: id, archive: value });
  const view = async (id: string, state: "completed" | "failed" | "stopped") => untilSetup(async () => { const found = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${id}`); return found.work.state === state ? found : undefined; }, `Assistant becomes ${state}`, 20_000);
  for (const scenario of ["first-owner-changes-while-second-waits", "unrelated-C-changes"] as const) {
    const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let first: typeof made[number] | undefined, gated = false;
    t.mock.method(lifecycle, "read", async (session: Parameters<typeof originalRead>[0]) => {
      const row = made.find(item => item.session.session_id === session.session_id);
      if (row && !gated) {
        if (!first) first = row;
        else if (row !== first) { gated = true; reached.resolve(); await release.promise; }
      }
      return originalRead(session);
    });
    const at = f.requests.length, sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: scenario, request_id: crypto.randomUUID() });
    try {
      await reached.promise; assert.ok(first);
      if (scenario === "first-owner-changes-while-second-waits") await archive(first.id, true);
      else {
        const otherReference = molisWorkHostProjectReference({ projectId: f.other.project_id, databasePath: f.other.database_path });
        const otherClient = f.host.actionClient(otherReference), otherCaller = await f.host.localPersonContext(otherReference);
        await otherClient.invoke(otherCaller, { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: other.body.session.session_id, archive: true });
        assert.deepEqual(await otherClient.invoke(await f.host.localPersonContext(otherReference), { capability_id: "coding.subject.state", version: 1, provider_id: "io.molis.work.coding" }, { subject_id: other.body.session.session_id }), { subject: { kind: "coding_session", id: other.body.session.session_id }, state: "archived" });
      }
      release.resolve(); const sent = await sending;
      const result = await view(sent.work.work_id, scenario === "unrelated-C-changes" ? "completed" : "failed");
      if (scenario === "unrelated-C-changes") {
        assert.ok(f.requests.length > at);
        assert.ok(f.requests.slice(at).some(request => made.every(row => JSON.stringify(request).includes(row.marker))));
      } else {
        assert.equal(f.requests.length, at);
        const run = await adapter.read({ runtime_id: "prologue", session_id: result.work.session_id!, run_id: result.rounds.at(-1)!.run_id });
        assert.match(JSON.stringify(run), /EFFECT_NOT_AUTHORIZED|knowledge.source_changed|所选项目资料当前不可用于本轮/);
      }
      assert.equal(live, 0);
    } finally { release.resolve(); await sending.catch(() => undefined); }
    if (scenario === "first-owner-changes-while-second-waits") { await archive(first!.id, false); await stable(); }
  }
  t.mock.method(lifecycle, "read", async (session: Parameters<typeof originalRead>[0]) => {
    const found = await originalRead(session);
    return { ...found, owner: { ...found.owner, actor_id: "different-owner" } };
  });
  const ownerAt = f.requests.length, ownerMismatch = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "owner identity refusal", request_id: crypto.randomUUID() });
  await view(ownerMismatch.work.work_id, "failed"); assert.equal(f.requests.length, ownerAt); assert.equal(live, 0);
  t.mock.method(lifecycle, "read", originalRead);
  let startDisposed = 0;
  t.mock.method(host, "start", async (...args: Parameters<typeof originalStart>) => {
    const dispose = args[2].disposeDispatch;
    return originalStart(args[0], args[1], { ...args[2], beforeStart: () => { throw Object.assign(new Error("explicit start preparation refusal"), { code: "actions.forbidden" }); }, disposeDispatch: () => { startDisposed++; dispose?.(); } });
  });
  const startAt = f.requests.length;
  const refused = await f.call(project, "/api/assistant/send", { text: "start preparation refusal", request_id: crypto.randomUUID() });
  assert.ok(refused.status >= 400); assert.equal(startDisposed, 1); assert.equal(f.requests.length, startAt); assert.equal(live, 0);
  t.mock.method(host, "start", originalStart);
  for (const close of [false, true]) {
    providerGate = { reached: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
    const sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: close ? "close held Run" : "cancel held Run", request_id: crypto.randomUUID() });
    try {
      await providerGate.reached.promise;
      const sent = await sending, current = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
      assert.ok(live > 0, "start returning does not dispose a still-running selection");
      if (close) await adapter.close();
      else {
        await adapter.control({ runtime_id: "prologue", session_id: current.work.session_id!, run_id: current.rounds.at(-1)!.run_id }, { kind: "cancel" });
        await view(sent.work.work_id, "stopped");
      }
      assert.equal(live, 0);
    } finally { providerGate.release.resolve(); await sending.catch(() => undefined); providerGate = undefined; }
  }
  t.diagnostic("A4_MULTI_RELEASE " + JSON.stringify({ live, disposed, startDisposed }));
});

test("A4-K an existing observation invalidated inside the next retained authority await cannot be refreshed by that dispatch", { timeout: 90_000 }, async t => {
  let requestToolOnce = false;
  const f = await codingProductHost(t, request => {
    if (requestToolOnce) {
      requestToolOnce = false;
      return cogniaScriptedResponse({ name: "read-capability", input: { capability_id: knowledgeActions.list.capability_id, version: knowledgeActions.list.version, provider_id: "system.knowledge", input: {} } });
    }
    return cogniaModelResponse(endingReviewAnswer(request, () => []) ?? "完成。");
  }, { loopbackProvider: true });
  const project = f.project.project_id, prefix = `/projects/${project}`, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title: "authority await 原始来源" });
  assert.equal(created.status, 200);
  const id = created.body.session.session_id, subject = { kind: "coding_session", id };
  const started = await f.call<{ run: { ref: AgentRunRef } }>(project, `${coding}/sessions/${id}/runs`, { task: "只回复原始资料内容", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200); assert.equal((await f.ended(started.body.run.ref)).phase, "completed"); await f.call(project, coding + "/state");
  const reference = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path }), client = f.host.actionClient(reference), person = await f.host.localPersonContext(reference);
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  await untilSetup(async () => { await client.invoke(await f.host.localPersonContext(reference), knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "the real source card is ready", 20_000);
  const title = "A4_AUTHORITY_AWAIT_TITLE", brief = "A4_AUTHORITY_AWAIT_BRIEF";
  await f.web.post(prefix + "/api/knowledge/edit", { subject, title, brief });
  const agentHost = ensureSystemAgentService(f.host, f.home).agentHost, adapter = agentHost.adapter("prologue"), lifecycle = adapter.sessionLifecycle!, originalObserve = lifecycle.observeWrites!.bind(lifecycle);
  let acquired = 0, released = 0, live = 0;
  t.mock.method(lifecycle, "observeWrites", (...args: Parameters<typeof originalObserve>) => {
    const observation = originalObserve(...args); let disposed = false;
    acquired++; live++;
    return { assert_current: observation.assert_current, dispose: () => { if (!disposed) { disposed = true; released++; live--; observation.dispose(); } } };
  });
  const at = f.requests.length, reached = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let armed = true, selectedCatalogReturned = false;
  const search = f.host.search!, originalCatalog = search.knowledgeCatalog.bind(search), trace: Array<Record<string, unknown>> = [];
  t.mock.method(search, "knowledgeCatalog", async (...args: Parameters<typeof originalCatalog>) => {
    const access = args[3], original = access.caller;
    const caller: import("@molis-ai/molis-work-contracts/platform/actions").ActionCallContext = { ...original, validate_authority: async target => {
      await original.validate_authority?.(target);
      if (armed && selectedCatalogReturned && f.requests.length > at && target.capability_id === "coding.subject.state" && target.provider_id === "io.molis.work.coding") {
        armed = false;
        const stack = new Error().stack ?? "", fromKernelRetainedAuthority = /action-execution-context\.(?:ts|js)/.test(stack), fromSelectedDispatch = /knowledge-dispatch\.(?:ts|js)/.test(stack);
        assert.ok(fromKernelRetainedAuthority && fromSelectedDispatch, "the gate is reached from the original Kernel retained authority inside this knowledge beforeDispatch");
        trace.push({ phase: "retained-authority-await", fromKernelRetainedAuthority, fromSelectedDispatch, target, requests: f.requests.length - at, acquired, live });
        reached.resolve(); await gate.promise;
      }
    } };
    const prepared = await originalCatalog(args[0], args[1], args[2], { ...access, caller });
    if (prepared.catalog.pieces.some(piece => piece.subject.kind === subject.kind && piece.subject.id === id)) selectedCatalogReturned = true;
    return prepared;
  });
  requestToolOnce = true;
  const sending = f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "先读资料再继续", request_id: crypto.randomUUID() });
  try {
    await reached.promise;
    assert.equal(f.requests.length - at, 1, "the first actual Provider request already succeeded");
    assert.match(JSON.stringify(f.requests[at]), new RegExp(title)); assert.match(JSON.stringify(f.requests[at]), new RegExp(brief));
    assert.equal(acquired, 1); assert.equal(live, 1, "the next authority await started with an existing valid observation");
    const update = { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" };
    await client.invoke(await f.host.localPersonContext(reference), update, { session_id: id, archive: true });
    await client.invoke(await f.host.localPersonContext(reference), update, { session_id: id, archive: false });
    assert.deepEqual(await client.invoke(await f.host.localPersonContext(reference), { capability_id: "coding.subject.state", version: 1, provider_id: "io.molis.work.coding" }, { subject_id: id }), { subject, state: "active" });
    const restoredOwner = await f.call<{ session: { runtime_id: string; runtime_session_id: string } }>(project, `${coding}/sessions/${id}`);
    assert.equal(restoredOwner.status, 200);
    const sourceSession = { runtime_id: restoredOwner.body.session.runtime_id, session_id: restoredOwner.body.session.runtime_session_id };
    assert.equal(sourceSession.session_id, started.body.run.ref.session_id);
    assert.equal((await lifecycle.read(sourceSession)).view.state, "active");
    trace.push({ phase: "formal-archive-restore-complete", requests: f.requests.length - at, acquired, live });
    gate.resolve(); const sent = await sending;
    const final = await untilSetup(async () => { const value = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`); return ["failed", "completed"].includes(value.work.state) ? value : undefined; }, "the actual Assistant Run reaches its terminal result", 20_000);
    const actual = await adapter.read({ runtime_id: "prologue", session_id: final.work.session_id!, run_id: final.rounds.at(-1)!.run_id });
    const count = f.requests.length - at;
    t.diagnostic("A4_AUTHORITY_AWAIT " + JSON.stringify({ requests: count, phase: actual.phase, acquired, released, live, trace }));
    assert.equal(count, 1, "an observation invalidated inside this retained authority await blocks the second Provider request without refreshing");
    assert.equal(actual.phase, "failed"); assert.match(JSON.stringify(actual), /EFFECT_NOT_AUTHORIZED|knowledge.source_changed|所选项目资料当前不可用于本轮/);
    assert.equal(acquired, 1, "this failed dispatch never acquires a replacement observation"); assert.equal(live, 0); assert.equal(released, acquired);
    const positiveAt = f.requests.length;
    const positive = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "已明确恢复后的新调用", request_id: crypto.randomUUID() });
    await untilSetup(async () => { const value = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${positive.work.work_id}`); return value.work.state === "completed" ? true : undefined; }, "a new call after explicit restore succeeds", 20_000);
    assert.ok(f.requests.slice(positiveAt).some(request => JSON.stringify(request).includes(title) && JSON.stringify(request).includes(brief)));
    assert.equal(live, 0); assert.equal(released, acquired);
    t.diagnostic("A4_AUTHORITY_AWAIT_NEW_CALL " + JSON.stringify({ requests: f.requests.length - positiveAt, acquired, released, live }));
  } finally { gate.resolve(); await sending.catch(() => undefined); }
});
