import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// specs/project-knowledge PMAT-33: a round's 「本轮情况」 says how many documents the project holds, counted by the rule
// knowledge.list shows them by, so a question that sounds general is not answered from general knowledge for want of that fact.
// PMAT-35: the round also gets 「项目资料目录」, titles and briefs to choose from and the knowledge actions' exact identities.

interface States { states: Array<{ kind: string; id: string; excluded: boolean }>; listing: boolean }

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
  // PG-077: the platform Artifact provider is available without a project Plugin member.
  const home = await openTestHome(t), project = await home.createProject("资料");
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
