import assert from "node:assert/strict";
import test from "node:test";
import { MolisWorkLocalHost, ensureSystemAgentService, connectorManagementActions, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome, serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { connectorAssistantModel, toolField, untilSetup } from "./fixtures/connector-assistant-model.js";

const read = (server: TestHostServer, id: string) => server.web.get<AssistantWorkView>(`/api/assistant/works/${id}`);
const authorizationState = (host: MolisWorkLocalHost, id: string) => host.homeActionClient().invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: ["connectors:management:read"] }, connectorManagementActions.authorization, { authorization_id: id }) as Promise<{ commit_held?: boolean }>;
const setup = { service_id: "model-api", method: "token", display_name: "Work service", expected_revision: null };
const query = (id: string) => ({ name: "read-capability", input: { capability_id: "connectors.authorization.read", version: 1, provider_id: "system.connectors", input: { authorization_id: id } } });

for (const restart of [false, true]) test(`ASC-09 ASC-18 ASC-25 ASC-33: the Assistant resumes its own setup once without an open page${restart ? " after Host restart" : ""}`, { timeout: 70_000 }, async t => {
  let server: TestHostServer;
  let restartedHost: MolisWorkLocalHost | undefined;
  t.after(async () => { await server?.close(); await restartedHost?.close(); });
  const home = await openTestHome(t);
  server = home;
  let authorization = "";
  const model = await connectorAssistantModel(t, home.home, (body, turn) => {
    if (turn === 1) return { name: "find-capabilities", input: { query: "准备服务接入" } };
    if (turn === 2) return { name: "change-capability", input: { capability_id: "connectors.setup.prepare", version: 1, provider_id: "system.connectors", input: setup } };
    if (turn === 3) {
      authorization = String(toolField(body.messages, "authorization_id") ?? "");
      return { name: "board-wait", input: { on: [{ kind: "external", checker: "molis.connector-setup@1", params: { authorization_id: authorization } }], onFailure: "block", deadlineMinutes: 30, reason: "等待工作服务接入" } };
    }
    if (turn === 4) return "正在等待你填写工作服务凭据。";
    if (turn === 5) return query(authorization);
    return "已读取到接入状态；连接已保存。";
  });
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: "帮我接入工作服务，完成后读取接入状态", request_id: crypto.randomUUID() });
  const review = await untilSetup(async () => (await read(home, sent.work.work_id)).reviews[0], "setup approval");
  await home.web.post(`/api/assistant/works/${sent.work.work_id}/reviews/${review.review_id}`, { decision: "approve" });
  const waiting = await untilSetup(async () => { const view = await read(home, sent.work.work_id); return view.work.state === "waiting-input" && view.rounds[0]?.phase === "completed" ? view : undefined; }, "durable setup wait");
  assert.equal(waiting.rounds.length, 1);
  assert.match(authorization, /^[0-9a-f-]{36}$/);
  assert.equal(model.requests.length, 4);
  const waitingCalls = model.allRequests.length;
  await new Promise(resolve => setTimeout(resolve, 3_000));
  assert.equal(model.allRequests.length, waitingCalls, "pending owner checks never call a model, including the ending review");
  if (!restart) {
    // ASC-33: the borrowed transport can close while the Host keeps the pending work alive.
    await home.close();
    server = await serveTestHost(null, { home: home.home, host: home.host });
  }
  if (restart) {
    await home.close(); await home.host.close();
    restartedHost = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
    server = await serveTestHost(null, { home: home.home, host: restartedHost });
  }
  const saved = await server.web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections", { service_id: "model-api", token: "fixture-protected-setup-secret", display_name: "Work service", setup_id: authorization });
  const done = await untilSetup(async () => { const view = await read(server, sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "one automatic continuation");
  assert.equal(done.rounds.length, 2);
  const system = ensureSystemAgentService(restartedHost ?? home.host, home.home); await system.ready;
  const adapter = system.agentHost.adapter("prologue");
  const original = await adapter.read({ session_id: done.work.session_id!, run_id: done.rounds[0]!.run_id });
  const continued = await adapter.read({ session_id: done.work.session_id!, run_id: done.rounds[1]!.run_id });
  assert.equal(original.original_input?.written_by, "person");
  assert.deepEqual(continued.original_input, original.original_input, "automatic continuation reuses the canonical original, including across Host restart");
  assert.deepEqual(continued.frozen.continued_from, original.ref);
  assert.equal(model.requests.length, 6);
  assert.equal(toolField(model.requests[5]?.messages, "status"), "connected", "the resumed round reads the actual committed request");
  assert.equal(toolField(model.requests[5]?.messages, "connection_id"), saved.connection.connection_id);
  assert.doesNotMatch(JSON.stringify(model.allRequests), /fixture-protected-setup-secret|fixture-loopback-model/);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(saved.connection.connection_id, "model-api")), "fixture-protected-setup-secret");
  await assert.rejects(server.web.post("/api/settings/connectors/connections", { service_id: "model-api", token: "fixture-replayed-secret", setup_id: authorization }), { status: 400 });
  const completedCalls = model.allRequests.length;
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(model.requests.length, 6, "replayed completion cannot start another round");
  assert.equal(model.allRequests.length, completedCalls, "replayed completion does not call a model for any purpose");
});

test("ASC-33 ASC-34: latest Send holds the original setup; an explicit retain survives restart and the continuation receives the latest request", { timeout: 70_000 }, async t => {
  let server: TestHostServer;
  let restartedHost: MolisWorkLocalHost | undefined;
  t.after(async () => { await server?.close(); await restartedHost?.close(); });
  const home = await openTestHome(t);
  server = home;
  let authorization = "";
  const latest = "继续接入，但接好后只读接入状态，不保存任何内容";
  const wait = () => ({ name: "board-wait", input: { on: [{ kind: "external", checker: "molis.connector-setup@1", params: { authorization_id: authorization } }], onFailure: "block", deadlineMinutes: 30, reason: "按最新要求等待接入" } });
  const model = await connectorAssistantModel(t, home.home, (body, turn) => {
    if (turn === 1) return { name: "find-capabilities", input: { query: "准备服务接入" } };
    if (turn === 2) return { name: "change-capability", input: { capability_id: "connectors.setup.prepare", version: 1, provider_id: "system.connectors", input: setup } };
    if (turn === 3) { authorization = String(toolField(body.messages, "authorization_id") ?? ""); return wait(); }
    if (turn === 4) return "等待本人接入。";
    if (turn === 5) return { name: "find-capabilities", input: { query: "按最新要求保留或取消接入" } };
    if (turn === 6) return query(authorization);
    if (turn === 7) return { name: "change-capability", input: { capability_id: "connectors.setup.resolve", version: 1, provider_id: "system.connectors",
      input: { authorization_id: authorization, intent_revision: toolField(body.messages, "intent_revision"), decision: "retain" } } };
    if (turn === 8) return wait();
    if (turn === 9) return "按最新要求继续等待；接好后只读状态。";
    if (turn === 10) return query(authorization);
    return "已只读核对接入状态。";
  });
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: "接入工作服务后保存资料", request_id: crypto.randomUUID() });
  const approve = async (reviewId: string) => home.web.post(`/api/assistant/works/${sent.work.work_id}/reviews/${reviewId}`, { decision: "approve" });
  const initialReview = await untilSetup(async () => (await read(home, sent.work.work_id)).reviews[0], "initial setup approval");
  await approve(initialReview.review_id);
  await untilSetup(async () => { const view = await read(home, sent.work.work_id); return view.work.state === "waiting-input" && view.rounds[0]?.phase === "completed" ? view : undefined; }, "initial wait");
  await home.web.post("/api/assistant/send", { work_id: sent.work.work_id, text: latest, request_id: crypto.randomUUID() });
  const retainedReview = await untilSetup(async () => (await read(home, sent.work.work_id)).reviews.find(review => review.review_id !== initialReview.review_id), "latest intent approval");
  assert.equal((await authorizationState(home.host, authorization)).commit_held, true);
  assert.match(JSON.stringify(model.requests[6]?.messages), new RegExp(latest));
  await approve(retainedReview.review_id);
  await untilSetup(async () => { const view = await read(home, sent.work.work_id); return view.work.state === "waiting-input" && view.rounds.length === 2 && view.rounds[1]?.phase === "completed" ? view : undefined; }, "new wait under latest intent");
  assert.notEqual((await authorizationState(home.host, authorization)).commit_held, true);
  assert.equal(model.requests.length, 9);
  await home.close(); await home.host.close();
  restartedHost = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  server = await serveTestHost(null, { home: home.home, host: restartedHost });
  const saved = await server.web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections", { service_id: "model-api", token: "fixture-latest-intent-secret", display_name: "Work service", setup_id: authorization });
  const done = await untilSetup(async () => { const view = await read(server, sent.work.work_id); return view.rounds.length === 3 && view.work.state === "completed" ? view : undefined; }, "latest-intent continuation");
  assert.equal(done.rounds.length, 3);
  assert.equal(model.requests.length, 11);
  assert.match(JSON.stringify(model.requests[9]?.messages), new RegExp(latest), "the resumed model consumes the latest accepted request from the same Session");
  assert.equal(toolField(model.requests[10]?.messages, "connection_id"), saved.connection.connection_id);
  assert.doesNotMatch(JSON.stringify(model.allRequests), /fixture-latest-intent-secret|fixture-loopback-model/);
  const completedCalls = model.allRequests.length;
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(model.requests.length, 11, "the withdrawn first wait cannot start another continuation");
  assert.equal(model.allRequests.length, completedCalls, "the withdrawn first wait does not call a model for any purpose");
});
