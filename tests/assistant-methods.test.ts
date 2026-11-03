import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { AssistantService } from "@molis-ai/molis-work-app-local-host";
import { assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { registerPluginAgentDefinitions } from "../apps/local-host/dist/plugin-instructions.js";
import { homeAgentDefinitions, homeStores } from "@molis-ai/molis-work-app-local-host";
import { createPagesPlugin } from "@molis-ai/molis-work-plugin-pages";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`Expected ${what} not reached`);
}

function reply(text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

const PAGES_METHOD = "io.molis.work.pages/meeting-notes";

test("a method a Plugin offers for business work is declared with business tools only and registered with the Host by id and version while it runs", async () => {
  const declared = (methods: unknown[]) => manifestProblems(declarationManifest({ methods }));
  assert.equal(declared([{ skill_id: "notes", version: 1, name: "纪要", summary: "整理纪要", tools: ["read-capability"] }]), "");
  // RAC-1757: the same refusal after the T-111 renames (SKILL_TOOLS, inspectSkillDeclarations).
  assert.match(declared([{ skill_id: "edit", version: 1, name: "改代码", summary: "改文件", tools: ["edit-file"] }]), /只能使用业务工具/);
  assert.match(declared([{ skill_id: "x", version: 1, name: "无说明", summary: "", tools: ["read-capability"] }]), /适用说明/);
  const home = await mkdtemp(join(tmpdir(), "assistant-methods-registry-"));
  try {
    const registry = homeAgentDefinitions(home);
    assert.equal(registry.methods().find(method => method.key === PAGES_METHOD), undefined, "nothing of Pages' until it runs (PG-051)");
    registerPluginAgentDefinitions({ directory: home, completeText: () => undefined, stores: homeStores() }, createPagesPlugin(), "pages-install");
    const listed = registry.methods().find(method => method.key === PAGES_METHOD);
    assert.ok(listed, "Pages' method is registered with the Host, from its running definition");
    assert.equal(listed.source.kind, "plugin");
    assert.deepEqual([listed.name, listed.version], ["会议纪要整理", 2]);
    // ADH-14: whether writing the page asks first is the Host's, by the action's effect; the method no longer stops for it.
    assert.equal(listed.summary, "把一段会议记录或一篇会议文档整理成结论、待办（谁、做什么、何时）和待定问题，每条注明依据；用户要时写成 Pages 文档。");
    const method = registry.method("io.molis.work.pages", "meeting-notes", 2);
    assert.match(method.body, /待定问题/);
    assert.match(method.body, /\n5\. 用户要写成 Pages 文档时，新建文档写入；不覆盖已有文档，除非用户明确要求。$/);
    assert.doesNotMatch(method.body, /确认/);
    assert.throws(() => registry.method("io.molis.work.pages", "meeting-notes", 1), /没有登记这个方法版本/);
    assert.equal(registry.diagnostics().owners.find(owner => owner.owner_id === "io.molis.work.pages")?.methods, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("a round lists the methods its scope can use; one the person chose goes with that round only, and a round may read one itself", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-methods-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "方法实操", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (url: unknown, init: RequestInit) => {
    if (!String(url).startsWith("https://1.1.1.1/")) throw new Error("unexpected network request in fixture: " + String(url));
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply();
  }));
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-methods-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const registry = homeAgentDefinitions(home);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => agentHost,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")),
    scopeActions: async work => {
      const ref = work.project_ref;
      const scoped = ref ? local.actionClient(ref) : local.homeActionClient();
      return { discover: async () => scoped.discover(await local.localPersonContext(ref)),
        invoke: async (action, input) => scoped.invoke(await local.localPersonContext(ref), action, input) };
    },
    methods: { list: () => registry.methods(), read: (owner, skill, version) => registry.method(owner, skill, version) },
    projectTitle: async () => project.display_name, timeZone: "Asia/Shanghai" }, "web-user");
  try {
    const methods = await service.reads.methods(null, { project_ref: reference });
    assert.ok(methods.some(method => method.method_id === PAGES_METHOD && method.plugin_title === "Pages"), JSON.stringify(methods));

    // Chosen with “/”: its registered steps go with this round, said as the person's choice.
    const sent = await service.send({ text: "整理一下：周三定了双周会，张三下周五前出看板，预算还没定", request_id: "method-send-1",
      materials: [{ material_id: "method-1", kind: "method", title: "方法：会议纪要整理", explicit: true, method: { method_id: PAGES_METHOD } }] }, { project_ref: reference });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    const first = requests.at(-1)!;
    assert.ok(first.includes("用户为这一轮选定的方法「会议纪要整理」"), "the chosen method reaches the model as the person's choice");
    assert.ok(first.includes("待定问题"), "with its registered steps");
    assert.deepEqual((await service.read(sent.work.work_id)).rounds[0]!.materials.map(item => [item.kind, item.title]), [["method", "方法：会议纪要整理"]]);

    // The next round does not carry it; the method is listed, for the round to read if it fits.
    await service.send({ text: "再补一条：李四负责预算", request_id: "method-send-2", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const second = requests.at(-1)!;
    assert.ok(!second.includes("用户为这一轮选定的方法"), "a chosen method is for its own round only");
    assert.ok(second.includes("可用的方法") && second.includes(PAGES_METHOD), "the round sees which methods it can read");
    assert.ok(second.includes("input 是对象，例如") && second.includes("method_id"), "and exactly how to read one (its input is an object)");

    // Reading one, as the round's own read action does; one that is not offered here is refused with why.
    const read = await service.reads.readMethod(service.reads.workRecord(sent.work.work_id), PAGES_METHOD);
    assert.match(read.body, /每条结论和待办后面用括号注明原文依据/);
    await assert.rejects(service.reads.readMethod(null, "io.molis.work.pages/unknown"), /没有可用的方法/);
  } finally {
    service.continuations.close(); await adapter.close();
    await local.close();
    await rm(home, { recursive: true, force: true });
  }
});
