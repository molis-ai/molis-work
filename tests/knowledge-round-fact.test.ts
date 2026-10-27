import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// specs/project-knowledge PMAT-33: a round's 「本轮情况」 says how many documents the project holds, counted by the rule
// knowledge.list shows them by, so a question that sounds general is not answered from general knowledge for want of that fact.
// PMAT-35: the round also gets 「项目资料目录」, titles and briefs to choose from and the knowledge actions' exact identities.

interface States { states: Array<{ kind: string; id: string; state: string; excluded: boolean }>; listing: boolean }

/** Preload only the public Node Host factory before any product modules enter the isolated child. */
async function assistantFinalDispatchChild(t: TestContext, change: string, name: string): Promise<void> {
  const env = { ...process.env, MOLIS_WORK_TEST_ASSISTANT_FINAL_DISPATCH: change, MOLIS_WORK_TEST_SOURCE_FINAL_BOUNDARY: "sdk" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--no-warnings", "--unhandled-rejections=strict", "--experimental-test-module-mocks", "--import", "tsx",
    "--import", fileURLToPath(new URL("./fixtures/assistant-final-dispatch.mjs", import.meta.url)),
    "--test", "--test-isolation=none", "--test-concurrency=1", `--test-name-pattern=^${name}$`, fileURLToPath(import.meta.url)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const exited = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
  const stop = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); };
  t.signal.addEventListener("abort", stop, { once: true });
  t.after(async () => { stop(); await exited; });
  assert.equal(await exited, 0, stdout + stderr);
  assert.ok(stdout.includes(`ASSISTANT_FINAL_SOURCE_DONE ${change}`), "the selected child must exercise and finish the actual dispatch assertion");
}

for (const change of ["exclude", "edit"] as const) {
  const name = `MEM-SOURCE-CAPTURE Assistant refuses a card ${change} during the final SDK authorization wait`;
  test(name, { timeout: 90_000 }, async t => {
    if (process.env.MOLIS_WORK_TEST_ASSISTANT_FINAL_DISPATCH !== change) return assistantFinalDispatchChild(t, change, name);
    const { armAssistantFinalDispatch } = await import("./fixtures/assistant-final-dispatch.mjs");
    const home = await openTestHome(t), project = await home.createProject("发送前资料复核", ["artifacts"]);
    const prefix = `/projects/${project.project_id}`, model = await connectorAssistantModel(t, home.home, () => "不应收到旧资料。");
    await home.web.post(prefix + "/api/artifacts/import", { source: "file", filename: "消防制度.md", content: "# 消防\n先按报警按钮。" });
    const listed = await untilSetup(async () => {
      const states = await home.web.get<States>(prefix + "/api/knowledge/states");
      return !states.listing && states.states.length === 1 && states.states[0]!.state === "ready" ? states : undefined;
    }, "the nonempty source finishes its real background organization before arming the Assistant request");
    const subject = { kind: listed.states[0]!.kind, id: listed.states[0]!.id };
    const search = home.host.search!, original = search.knowledgeCatalog.bind(search);
    let materialChecks = 0;
    t.after(() => { search.knowledgeCatalog = original; });
    // Observe successful production async checks, without holding or replacing their decision.
    search.knowledgeCatalog = async (...args) => {
      const catalog = await original(...args);
      if (!catalog?.pieces.length) return catalog;
      const beforeDispatch = catalog.beforeDispatch; assert.ok(beforeDispatch);
      return { ...catalog, beforeDispatch: async views => { await beforeDispatch(views); materialChecks++; } };
    };
    const network = armAssistantFinalDispatch(), transportBefore = model.transportRequests.length;
    t.after(network.release); t.signal.addEventListener("abort", network.release, { once: true });
    try {
      const pending = home.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "消防制度第一步是什么？", request_id: crypto.randomUUID() });
      const sent = await Promise.all([pending, network.entered]).then(([sent]) => sent);
      assert.equal(sent.outcome, "started");
      const running = await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
      assert.equal(running.work.state, "running"); assert.equal(running.rounds.at(-1)?.run_id, sent.run_id);
      assert.ok(materialChecks > 0, "the original async material authority already passed before the SDK wait");
      const checksBeforeRelease = materialChecks;
      assert.equal(network.observed().prepared, 1); assert.equal(network.observed().holds, 1);
      assert.ok(network.observed().factoryCalls > 0, "the default Home really used the decorated public Node Host factory");
      assert.equal(model.transportRequests.length, transportBefore);
      const edited = await home.web.post<KnowledgeCardRecord>(prefix + `/api/knowledge/${change}`, change === "exclude"
        ? { subject, excluded: true } : { subject, title: "本人刚修改的资料标题" });
      network.release();
      const stopped = await untilSetup(async () => {
        const view = await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
        return view.work.state === "failed" && view.rounds.at(-1)?.phase === "failed" ? view : undefined;
      }, "the accepted Assistant round ends with the final dispatch refusal");
      assert.equal(stopped.rounds.at(-1)!.run_id, sent.run_id);
      assert.ok(stopped.rounds.at(-1)!.stop_reason?.trim(), "the real failed round retains its error reason");
      assert.equal(materialChecks, checksBeforeRelease, "no later async material check is responsible for this refusal");
      const observed = network.observed();
      assert.equal(observed.boundary, "sdk"); assert.equal(observed.sdkAuthorizationPresent, true);
      assert.ok(observed.fenceCalls > 0, "the original SDK fence ran successfully before the App source fence refused");
      assert.ok(observed.failure && typeof observed.failure === "object" && "code" in observed.failure);
      assert.equal(observed.failure.code, "EFFECT_NOT_AUTHORIZED");
      assert.deepEqual(observed.refusalInspection, { status: "failed", dispatched: false, retryable: false, retryAfterMs: undefined });
      assert.ok(observed.cancelCalls > 0, "the Agent's real terminal cleanup cancels this same refused handle");
      assert.deepEqual(await network.inspect(), { status: "cancelled", dispatched: false, retryable: false, retryAfterMs: undefined });
      assert.equal(model.transportRequests.length, transportBefore, "all actual HTTP requests are counted; no Assistant request or retry reaches the target");
      assert.deepEqual(model.allRequests, [], "the original catalog/tally never reaches the foreground model");
      const card = await home.web.get<{ card: KnowledgeCardRecord | null }>(prefix + `/api/knowledge/card?kind=${encodeURIComponent(subject.kind)}&id=${encodeURIComponent(subject.id)}`);
      assert.deepEqual(card.card, edited, "the original owner's final card decision survives the failed Assistant round unchanged");
      process.stdout.write(`ASSISTANT_FINAL_SOURCE_DONE ${change}\n`);
    } finally { network.release(); }
  });
}

/** The text of one of the round's materials in a model request. */
function material(messages: unknown, title: string): string {
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== "user" || typeof message.content !== "string" || !message.content.startsWith("Untrusted context data.")) continue;
    const data = JSON.parse(message.content.slice(message.content.indexOf("{"))) as { text?: string };
    const split = data.text?.indexOf("\n\n") ?? -1;
    if (split >= 0 && JSON.parse(data.text!.slice(0, split)).title === title) return data.text!.slice(split + 2);
  }
  return "";
}

test("PMAT-33 PMAT-35 PMAT-37 PMAT-39 本轮情况 counts the project's documents the round could list; kept-from-agents ones and a round without list get none", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("资料", ["artifacts"]);
  const prefix = `/projects/${project.project_id}`;
  const model = await connectorAssistantModel(t, home.home, () => "好。");
  const ask = async (work_id?: string) => {
    const before = work_id ? (await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${work_id}`)).rounds.length : 0;
    const sent = await home.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { ...(work_id ? { work_id } : {}), text: "库房着火第一步做什么？", request_id: crypto.randomUUID() });
    await untilSetup(async () => {
      const view = await home.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
      return view.work.state === "completed" && view.rounds.length > before ? view : undefined;
    }, "the round completes");
    const messages = model.requests.at(-1)?.messages;
    const tools = (model.requests.at(-1)?.tools ?? []) as Array<{ name: string; description?: string; input_schema?: unknown }>;
    return { work_id: sent.work.work_id, text: material(messages, "本轮情况"), catalog: material(messages, "项目资料目录"), tools };
  };

  const empty = await ask();
  assert.ok(empty.text.includes("项目「资料」") && !empty.text.includes("这个项目的资料"), `nothing counted, nothing said: ${empty.text}`);
  assert.equal(empty.catalog, "", "no catalog for a project with nothing in it");

  for (const [filename, content] of [["安全生产制度.md", "# 消防\n第一步按下报警按钮。"], ["差旅标准.md", "# 住宿\n一线城市 600 元。"]]) {
    await home.web.post(prefix + "/api/artifacts/import", { source: "file", filename, content });
  }
  const listed = await untilSetup(async () => {
    const states = await home.web.get<States>(prefix + "/api/knowledge/states");
    return !states.listing && states.states.length === 2 ? states : undefined;
  }, "both documents are in the project's catalog");
  const two = await ask(empty.work_id);
  assert.match(two.text, /这个项目的资料有 2 份（[^）]+ 2）。/, two.text);
  assert.ok(two.catalog.includes("一共 2 份，都列在下面") && two.catalog.includes("「安全生产制度") && two.catalog.includes("「差旅标准"), two.catalog);
  assert.match(two.catalog, /capability_id knowledge\.read，version 1；input 字段 subject（必填）、anchor/, "the identity and input to call it with");
  assert.match(two.catalog, /^- k[0-9a-f]{7}「/m, "each piece with its ref to name it by (PMAT-39)");
  assert.ok(!two.catalog.includes("600 元"), "titles and briefs, not the text");
  // PMAT-37: the round's every tool comes with its shape, so read-capability is called as the catalog says, without find-tools.
  const roster = two.tools.find(tool => tool.name === "find-tools")?.description?.match(/^- \S+: /gm) ?? [];
  assert.deepEqual(roster, [], "nothing deferred to a roster");
  for (const name of ["read-capability", "find-capabilities"]) assert.ok(two.tools.find(tool => tool.name === name)?.input_schema, `${name} is declared with its shape`);

  await home.web.post(prefix + "/api/knowledge/exclude", { subject: { kind: listed.states[0]!.kind, id: listed.states[0]!.id }, excluded: true });
  const one = await ask(empty.work_id);
  assert.match(one.text, /这个项目的资料有 1 份（[^）]+ 1）。/, "a document kept from agents is not counted");
  assert.ok(one.catalog.includes("一共 1 份") && (one.catalog.includes("「安全生产制度") !== one.catalog.includes("「差旅标准")), `a document kept from agents is not listed: ${one.catalog}`);

  await home.web.post(prefix + "/api/assistant/capabilities", { capability_id: "knowledge.list", version: 1, provider_id: "system.knowledge", enabled: false });
  const off = await ask(empty.work_id);
  assert.ok(!off.text.includes("这个项目的资料"), `a round that cannot list the documents is not told about them: ${off.text}`);
  assert.equal(off.catalog, "", "nor given their catalog");
});
