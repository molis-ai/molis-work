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
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";

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

test("an object picked with “@” is checked with its owner and read by it before the round; a pointer that no longer holds is refused", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-mentions-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "引用实操", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const owner = await localWebActionContext(local, reference, LOCAL_OWNER_PERMISSIONS);
  const client = local.actionClient(reference);
  const form = (await client.invoke(owner, formActions.create, { title: "供应商准入问卷" }) as { form: { id: string; version: number } }).form;
  await client.invoke(owner, formActions.update, { id: form.id, expected_version: form.version, description: "准入前需要核对营业执照与银行账户，逾期不补齐的暂停合作" });

  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (!String(url).startsWith("https://1.1.1.1/")) throw new Error("unexpected network request in fixture: " + String(url));
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply();
  });
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-mentions-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => agentHost,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")),
    // The person's own authority in the work's scope, as the web Host gives it.
    scopeActions: async work => {
      const ref = work.project_ref;
      const scoped = ref ? local.actionClient(ref) : local.homeActionClient();
      return { discover: async () => scoped.discover(await localWebActionContext(local, ref, LOCAL_OWNER_PERMISSIONS)),
        invoke: async (action, input) => scoped.invoke(await localWebActionContext(local, ref, LOCAL_OWNER_PERMISSIONS), action, input) };
    },
    projectTitle: async () => project.display_name, timeZone: "Asia/Shanghai" }, "web-user");
  try {
    // What the “@” list shows: a hit from the system search, found by the person.
    const found = await until(async () => {
      const result = await client.invoke(owner, searchActions.query, { query: "营业执照", scope: "all" }) as SearchQueryResponse;
      return result.hits.find(hit => hit.subject.id === form.id);
    }, "search hit");
    const picked = { material_id: "ref-1", kind: "object" as const, title: found.title, explicit: true, reference: { hit_id: found.hit_id },
      object: { kind: found.subject.kind, id: found.subject.id, title: found.title }, source: { surface: found.open?.surface ?? found.plugin_id, plugin_id: found.plugin_id, title: found.plugin_title },
      text: found.snippet };

    const sent = await service.send({ text: "按「供应商准入问卷」整理一份清单", request_id: "mention-send-1", materials: [picked] }, { project_ref: reference });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "round");
    const request = requests.at(-1)!;
    assert.ok(request.includes("逾期不补齐的暂停合作"), "the owner's full text reaches the model, not only the snippet");
    assert.ok(request.includes("已向"), "the model is told the text was read again from its owner");
    const view = await service.read(sent.work.work_id);
    assert.deepEqual(view.rounds[0]!.materials.map(item => [item.kind, item.object?.kind, item.object?.id]), [["object", found.subject.kind, form.id]]);
    assert.ok(view.objects.some(object => object.relation === "material" && object.subject.id === form.id), "the picked object is this work's material");

    // A pointer that no longer holds is refused before anything starts, and the words say which one.
    const before = requests.length;
    await assert.rejects(service.send({ text: "再看看这个", request_id: "mention-send-2", work_id: sent.work.work_id, materials: [{ ...picked, reference: { hit_id: "forged-hit" } }] }, {}),
      (error: unknown) => error instanceof AssistantError && /引用的「供应商准入问卷」/.test(error.message));
    assert.equal(requests.length, before, "no model call ran");

    // Which kind an open tab is, from what plugins declare for their searchable objects.
    const kinds = await service.surfaceKinds({ project_ref: reference });
    assert.equal(kinds.lingguang, "lingguang_spark");
    assert.equal(kinds[found.open?.surface ?? ""], found.subject.kind);
  } finally {
    await adapter.close();
    await local.close();
    await rm(home, { recursive: true, force: true });
  }
});
