import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MolisWorkLocalHost, connectorSetupAction } from "@molis-ai/molis-work-app-local-host";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome, serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { connectorAssistantModel, modelMaterial, toolField, untilSetup } from "./fixtures/connector-assistant-model.js";

const SOURCE = "Quarterly inventory: 17 blue notebooks remain.";
const TITLE = "Inventory from the connected source";
const SETUP_TITLE = "本会话未完成的服务接入（当前状态）";
type SetupSnapshot = { previous_wait_withdrawn: boolean; requests: Array<{ authorization_id: string; commit_held: boolean; completion_ready: boolean; intent_revision: string }> };
// A separate process serves the actual MCP resource and records every read outside the Assistant.
const RESOURCE_SERVER = `import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
if(process.env.SERVICE_KEY!=='fixture-business-resource-key')process.exit(1);
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{resources:{}},serverInfo:{name:'inventory-source',version:'1'}};
else if(m.method==='resources/list')result={resources:[{uri:'inventory://quarter',name:'Quarterly inventory',mimeType:'text/plain'}]};
else if(m.method==='resources/read'){appendFileSync('resource-reads.txt','read\\n');result={contents:[{uri:m.params.uri,mimeType:'text/plain',text:${JSON.stringify(SOURCE)}}]};}
else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Not supported'}})+'\\n');continue;}
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}`;

for (const scenario of ["save", "read-only", "recover"] as const) {
  test(`ASC-11 ASC-26 ASC-34: connected resource to the actual Pages owner (${scenario})`, { timeout: 90_000 }, async t => {
    let server: TestHostServer;
    let restored: MolisWorkLocalHost | undefined;
    t.after(async () => { await server?.close(); await restored?.close(); });
    const home = await openTestHome(t);
    server = home;
    const project = await home.createProject("Connected research", ["pages"]);
    const prefix = `/projects/${project.project_id}`;
    writeFileSync(join(home.home, "inventory.mjs"), RESOURCE_SERVER);
    const setup = { display_name: "Inventory source", expected_revision: null,
      source: { kind: "executable", executable: realpathSync(process.execPath) }, args: ["inventory.mjs"],
      cwd: realpathSync(home.home), environment_names: ["SERVICE_KEY"] };
    let authorization = "";
    const latest = "继续接入，但接好后只读取库存，不要创建或保存 Pages 文档";
    const call = (name: string, capability_id: string, provider_id: string, input: unknown) => ({ name, input: { capability_id, version: 1, provider_id, input } });
    const wait = () => ({ name: "board-wait", input: { on: [{ kind: "external", checker: "molis.connector-setup@1", params: { authorization_id: authorization } }], onFailure: "block", deadlineMinutes: 30, reason: "等待库存来源接入" } });
    const page = () => call("change-capability", "pages.create", pagesManifest.plugin_id, { title: TITLE, markdown: SOURCE });
    const firstReadTurn = scenario === "read-only" ? 10 : 5;
    const model = await connectorAssistantModel(t, home.home, (body, turn) => {
      if (turn === 1) return { name: "find-capabilities", input: { query: "准备本地 MCP" } };
      if (turn === 2) return call("change-capability", "connectors.local.prepare", "system.connectors", setup);
      if (turn === 3) { authorization = String(toolField(body.messages, "authorization_id") ?? ""); return wait(); }
      if (turn === 4) return "等待本人填写来源凭据。";
      if (scenario === "read-only" && turn < firstReadTurn) {
        if (turn === 5) {
          // ASC-34: current intent and withdrawn wait are facts in the new request, not inferred from old replies.
          const snapshot = modelMaterial(body.messages, SETUP_TITLE) as SetupSnapshot;
          assert.equal(snapshot.previous_wait_withdrawn, true);
          assert.deepEqual(snapshot.requests.map(request => [request.authorization_id, request.commit_held, request.completion_ready]), [[authorization, true, false]]);
          assert.equal(typeof snapshot.requests[0].intent_revision, "string");
          return { name: "find-capabilities", input: { query: "按最新要求保留或取消接入" } };
        }
        if (turn === 6) return call("read-capability", "connectors.authorization.read", "system.connectors", { authorization_id: authorization });
        if (turn === 7) return call("change-capability", "connectors.setup.resolve", "system.connectors", { authorization_id: authorization, intent_revision: toolField(body.messages, "intent_revision"), decision: "retain" });
        if (turn === 8) return wait();
        return "按最新要求继续等待，接好后只读取。";
      }
      // ASC-28 ASC-34: the real failure said setup was done, then only promised a read. The existing one-time guard
      // must continue this round; waiting replies above must not be held merely because they describe a later read.
      if (scenario === "read-only" && turn === firstReadTurn) return "接入已完成。现在按你的最新要求，只读取 `inventory://quarter`，不保存任何 Pages 文档。";
      const stage = turn - firstReadTurn - (scenario === "read-only" ? 1 : 0);
      if (stage === 0) {
        if (scenario === "read-only") {
          assert.match(JSON.stringify(body.messages), new RegExp(latest));
          assert.match(JSON.stringify(body.messages), /Your last message only said what you would do next and called no tool/);
        }
        return { name: "find-capabilities", input: { query: "读取 MCP 资源" } };
      }
      if (stage === 1) {
        const offered = toolField(body.messages, "capabilities");
        assert.ok(Array.isArray(offered));
        const resource = offered.find(value => value && typeof value === "object" && typeof value.capability_id === "string" && value.capability_id.endsWith(".resources.read"));
        assert.ok(resource, "the resumed model discovers the actual resource reference");
        return call("read-capability", resource.capability_id, resource.provider_id, { uri: "inventory://quarter" });
      }
      if (stage === 2) {
        assert.ok(JSON.stringify(body.messages).includes(SOURCE), "the model receives the actual resource result");
        return scenario === "read-only" ? SOURCE : { name: "find-capabilities", input: { query: "Pages 新建文档" } };
      }
      if (stage === 3) return scenario === "recover"
        ? call("change-capability", "pages.create", pagesManifest.plugin_id, { title: TITLE, body: { type: "doc", content: [{ type: "not_a_pages_node" }] } }) : page();
      if (stage === 4) return scenario === "recover" ? "来源已经读到，Pages 拒绝了正文格式；没有保存文档。" : "已把库存保存到 Pages。";
      if (stage === 5) {
        assert.ok(JSON.stringify(body.messages).includes(SOURCE), "the original resource result survives Host restart in this work");
        return page();
      }
      return "已用原来读到的库存完成保存。";
    }, given => {
      if (scenario !== "read-only" || model.requests.length !== firstReadTurn) return [];
      assert.match(given, /接入已完成。现在按你的最新要求/);
      return ["will_do"];
    });
    const sent = await home.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "接入库存来源，读取 inventory://quarter 并保存到 Pages", request_id: crypto.randomUUID() });
    const read = () => server.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
    const approved = new Set<string>();
    const reach = async (predicate: (view: AssistantWorkView) => boolean, label: string) => untilSetup(async () => {
      const view = await read();
      for (const review of view.reviews) if (!approved.has(review.review_id)) {
        approved.add(review.review_id);
        await server.web.post(`${prefix}/api/assistant/works/${sent.work.work_id}/reviews/${review.review_id}`, { decision: "approve" });
      }
      return predicate(view) ? view : undefined;
    }, label).catch(async error => {
      const view = await read();
      t.diagnostic(JSON.stringify({ label, requests: model.requests.length, state: view.work.state, rounds: view.rounds.map(round => ({ phase: round.phase, activity: round.activity })), reviews: view.reviews.map(review => review.review_id) }));
      throw error;
    });
    await reach(view => view.work.state === "waiting-input" && view.rounds[0]?.phase === "completed", "resource setup wait");
    assert.equal(model.requests.length, 4);
    if (scenario === "read-only") {
      await home.web.post(prefix + "/api/assistant/send", { work_id: sent.work.work_id, text: latest, request_id: crypto.randomUUID() });
      await reach(view => view.work.state === "waiting-input" && view.rounds.length === 2 && view.rounds[1]?.phase === "completed", "latest read-only wait");
    }
    await server.web.post("/api/settings/connectors/methods/local/connect", { setup_id: authorization, environment: { SERVICE_KEY: "fixture-business-resource-key" } });
    let done = await reach(view => view.work.state === "completed" && view.rounds.length === (scenario === "read-only" ? 3 : 2), "actual business continuation");
    const pages = () => server.web.get<{ documents: Array<{ id: string; title: string; body: unknown }> }>(prefix + "/api/pages");
    if (scenario === "recover") {
      assert.equal((await pages()).documents.length, 0, "the Pages owner refused the invalid body without a partial document");
      assert.ok(done.rounds.at(-1)?.activity.some(step => step.capability_id === "pages.create" && step.state === "failed"), "the failed save remains observable");
      await server.close(); await home.host.close();
      restored = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
      server = await serveTestHost(null, { home: home.home, host: restored });
      await server.web.post(prefix + "/api/assistant/send", { work_id: sent.work.work_id, text: "修正文档格式，用已读取的结果继续保存，不要重新读取来源", request_id: crypto.randomUUID() });
      done = await reach(view => view.work.state === "completed" && view.rounds.length === 3, "save after restart");
    }
    assert.equal(readFileSync(join(home.home, "resource-reads.txt"), "utf8"), "read\n", "the external source was read once across all rounds");
    assert.doesNotMatch(JSON.stringify(model.allRequests), /fixture-business-resource-key|fixture-loopback-model/);
    const saved = (await pages()).documents;
    if (scenario === "read-only") {
      assert.deepEqual(saved, [], "the withdrawn save has no plugin side effect");
      assert.equal(done.rounds.flatMap(round => round.activity).some(step => step.capability_id === "pages.create"), false);
    } else {
      assert.equal(saved.length, 1); assert.equal(saved[0]?.title, TITLE); assert.ok(JSON.stringify(saved[0]?.body).includes(SOURCE));
      const result = done.objects.find(object => object.relation === "result" && object.subject.kind === "pages_document");
      assert.equal(result?.subject.id, saved[0]?.id); assert.deepEqual(result?.open, { surface: "pages", id: saved[0]?.id });
      const opened = await server.web.get<{ document: { body: unknown } }>(`${prefix}/api/pages/${result!.subject.id}`);
      assert.ok(JSON.stringify(opened.document.body).includes(SOURCE), "the final result reference resolves to the actual owner's document");
    }
  });
}

test("ASC-25 ASC-34: setup context is scoped to the actor, session and project and respects the current read grant", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Setup context", ["pages"]);
  const prefix = `/projects/${project.project_id}`;
  const model = await connectorAssistantModel(t, home.home, () => "已查看本轮情况。");
  const sent = await home.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "先查看本轮情况", request_id: crypto.randomUUID() });
  const settled = (rounds: number) => untilSetup(async () => {
    const view = await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
    return view.work.state === "completed" && view.rounds.length === rounds ? view : undefined;
  }, "context round completes");
  const first = await settled(1), session = first.work.session_id!;
  const prepare = (actor_id: string, runtime_session_id: string, project_id: string | null, title: string) => (project_id ? home.host.actionClient(project.reference) : home.host.homeActionClient()).invoke({
    actor_id, runtime_session_id, project_id, audience: "agent", permissions: ["connectors:management:write"],
  }, connectorSetupAction, { service_id: "model-api", method: "token", display_name: title, expected_revision: null }) as Promise<{ authorization_id: string }>;
  const own = await prepare("web-user", session, project.project_id, "Own request");
  await prepare("another-person", session, project.project_id, "Other actor");
  await prepare("web-user", "another-session", project.project_id, "Other session");
  await prepare("web-user", session, null, "Other scope");
  await home.web.post(prefix + "/api/assistant/send", { work_id: sent.work.work_id, text: "读取当前接入情况", request_id: crypto.randomUUID() });
  await settled(2);
  const snapshot = modelMaterial(model.requests.at(-1)?.messages, SETUP_TITLE) as SetupSnapshot;
  assert.deepEqual(snapshot.requests.map(row => row.authorization_id), [own.authorization_id]);
  assert.equal(snapshot.requests[0]?.commit_held, true);
  assert.equal(snapshot.previous_wait_withdrawn, false, "a prior normal completion did not register a wait");
  await home.web.post(prefix + "/api/assistant/capabilities", { capability_id: "connectors.authorization.read", version: 1, provider_id: "system.connectors", enabled: false });
  const nextText = "撤回读取权限后再看本轮情况";
  await home.web.post(prefix + "/api/assistant/send", { work_id: sent.work.work_id, text: nextText, request_id: crypto.randomUUID() });
  await settled(3);
  const messages = model.requests.at(-1)?.messages;
  assert.ok(Array.isArray(messages));
  const start = messages.findLastIndex(message => message.role === "user" && message.content === nextText);
  assert.ok(start >= 0);
  assert.equal(modelMaterial(messages.slice(start), SETUP_TITLE), undefined, "a revoked read grant adds no current setup facts to the next round");
});
