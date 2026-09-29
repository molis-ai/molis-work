import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { formActions } from "@molis-ai/molis-work-plugin-form";
import { SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`Expected ${what} not reached`);
}

/** One Anthropic-style streamed reply: a tool call, or text. */
function reply(tool?: { name: string; input: unknown }, text = "Done."): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("an Assistant round on the real Host finds the capability, searches unopened content and reads the hit through its owner", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "system-search-assistant-run-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "助理检索实操", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const owner = await localWebActionContext(local, reference, LOCAL_OWNER_PERMISSIONS);
  const form = (await local.actionClient(reference).invoke(owner, formActions.create, { title: "供应商准入问卷" }) as { form: { id: string; version: number } }).form;
  await local.actionClient(reference).invoke(owner, formActions.update, { id: form.id, expected_version: form.version, description: "准入前需要核对营业执照与银行账户" });

  const requests: any[] = [];
  const script: Array<(body: any) => Response> = [
    () => reply({ name: "find-capabilities", input: { query: "搜索 内容" } }),
    body => {
      assert.ok(JSON.stringify(body.messages).includes("search.query"), "search is found in the Assistant's directory");
      return reply({ name: "read-capability", input: { capability_id: "search.query", version: 1, provider_id: SEARCH_PROVIDER_ID, input: { query: "营业执照" } } });
    },
    body => {
      const text = JSON.stringify(body.messages);
      assert.ok(text.includes("供应商准入问卷"), "the search result reaches the model");
      return reply({ name: "read-capability", input: { capability_id: "form.subject.read", version: 1, provider_id: "io.molis.work.form", input: { subject_id: form.id } } });
    },
    body => {
      assert.ok(JSON.stringify(body.messages).includes("银行账户"), "the owner's current text reaches the model");
      return reply(undefined, "找到了：供应商准入问卷，要求核对营业执照与银行账户。");
    },
  ];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (!String(url).startsWith("https://1.1.1.1/")) throw new Error("unexpected network request in fixture: " + String(url));
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script[turn++] ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.search-assistant-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => agentHost,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")),
    projectTitle: async () => project.display_name, timeZone: "Asia/Shanghai" }, "web-user");
  try {
    const sent = await service.send({ text: "帮我找一下哪里提到了营业执照", request_id: "req-search-0001" }, { project_ref: reference });
    assert.equal(sent.outcome, "started");
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return ["completed", "failed"].includes(view.work.state) ? view : undefined; }, "round end");
    assert.equal(done.work.state, "completed", JSON.stringify(done.rounds.at(-1)?.activity));
    assert.deepEqual(done.rounds[0]!.activity.map(item => `${item.verb}:${item.state}`), ["lookup:completed", "read:completed", "read:completed"]);
    assert.equal(done.reviews.length, 0, "searching and reading ask the person nothing");
    assert.equal(requests.length, 4);
  } finally {
    await adapter.close();
    await local.close();
    await rm(home, { recursive: true, force: true });
  }
});
