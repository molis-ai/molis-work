import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { defineSubjectContextAction, defineSubjectOffersAction, defineHomeEventsAction, subjectContext, type ActionCallContext, type ActionDefinition, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeEventActions, createHomeEventHandlers } from "../apps/local-host/src/home-event-actions.js";
import { createHomeOfferHandlers, homeOfferActions } from "../apps/local-host/src/home-offer-actions.js";
import { PersonalAssistantStore } from "../apps/local-host/src/personal-assistant-store.js";
import { PersonalAssistantService } from "../apps/local-host/src/personal-assistant-service.js";
import type { AssistantAnalysisInput, AssistantAnalysisPort, PersonalAssistantPorts } from "../apps/local-host/src/personal-assistant-types.js";

export const assistantCaller: ActionCallContext = { actor_id: "tester", project_id: "assistant-project", audience: "user", permissions: ["home:read", "home:write", "model:invoke", "material:read", "draft:write", "draft:read"] };
export function assistantFixture(databasePath = ":memory:") {
  const db = new DatabaseSync(databasePath), actions = new ActionService();
  db.exec("CREATE TABLE IF NOT EXISTS drafts(request_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  const context = new Map([
    ["rss", { title: "公开产品日志 · 导出需求更新", content: "九月发布需要新增 CSV 导出。", revision: "rss-1", kind: "feed_item" }],
    ["youtube", { title: "公开演示 · 导出使用反馈", content: "演示中的用户需要离线查看 CSV。", revision: "yt-1", kind: "feed_item" }],
    ["goal", { title: "九月工作台发布计划", content: "九月发布包含 PDF 导出，先完成可编辑的说明草稿。", revision: "goal-1", kind: "goal" }],
  ]);
  const readers = [defineSubjectContextAction("fixture.feed.read", "feed_item", "公开材料", ["material:read"]), defineSubjectContextAction("fixture.goal.read", "goal", "项目计划", ["material:read"]), defineSubjectContextAction("fixture.method.read", "alchemist-playbook", "确认的方法", ["material:read"])];
  const write: ActionDefinition = { capability_id: "fixture.draft.save", version: 1, operation: "command", action: { title: "保存可编辑草稿", description: "保存原动作拥有的草稿", kind: "operation", scope: "project", audiences: ["user"], permissions: ["draft:write"], subject_kinds: [],
    input_schema: { type: "object", properties: { request_id: { type: "string" }, body: { type: "string" } }, required: ["request_id", "body"], additionalProperties: false }, output_schema: { type: "object", properties: { request_id: { type: "string" }, body: { type: "string" } }, required: ["request_id", "body"] } } };
  const readDraft: ActionDefinition = { ...write, capability_id: "fixture.draft.get", operation: "query", action: { ...write.action, kind: "query", permissions: ["draft:read"],
    input_schema: { type: "object", properties: { request_id: { type: "string" } }, required: ["request_id"], additionalProperties: false }, output_schema: {} } };
  const events = defineHomeEventsAction("fixture.feed.events", ["feed_item"], "来源事项", ["material:read"]);
  const offers = defineSubjectOffersAction("fixture.draft.offers", ["goal"], "项目草稿", ["material:read"], [{ offer_id: "draft", title: "整理修改稿", action: { capability_id: write.capability_id, version: 1 } }]);
  let writes = 0, generationCount = 0, connected = true, failAfterWrite = false;
  let clock = new Date("2026-09-26T05:00:00Z"), captured: AssistantAnalysisInput | undefined;
  let analysis: AssistantAnalysisPort["analyze"] = async input => ({ runtime: "prologue", character_title: "Molis 助理", text: JSON.stringify({ outcome: "suggested", category: "requirement_change", title: "把新增 CSV 导出补进发布说明", reason: "两条公开内容都提到了 CSV，而项目计划目前只列出 PDF。建议先整理修改稿，保留原稿供对照。", offer_key: input.offers[0]?.key,
    evidence: input.materials.map(material => ({ material_key: material.key, quote: material.context.content })) }) });
  actions.registerProvider({ provider: { provider_id: "system.home", title: "Home", kind: "system", project_id: assistantCaller.project_id! }, definitions: [...Object.values(homeOfferActions), ...Object.values(homeEventActions)], handlers: [...createHomeOfferHandlers(actions), ...createHomeEventHandlers(actions, { capability_id: "none", version: 1 })] });
  actions.registerProvider({ provider: { provider_id: "fixture.materials", title: "Fixture owner", kind: "plugin", project_id: assistantCaller.project_id! }, definitions: [...readers, write, readDraft, offers, events], handlers: [
    ...readers.map(reader => ({ ...reader, handle: (_caller: ActionCallContext, input: unknown) => { const { subject_id } = input as { subject_id: string }; const row = context.get(subject_id); if (!row) throw new Error("missing"); return subjectContext({ subject: { kind: row.kind, id: subject_id }, title: row.title, content: row.content, revision: row.revision, goal_ids: ["goal"], session_id: null }); } })),
    { ...offers, handle: (_caller, value) => { const input = value as SubjectOffersInput; return { offers: [{ offer_id: "draft", title: "整理修改稿", action: { capability_id: write.capability_id, version: 1 }, input: { request_id: input.request_id, body: "# 九月发布说明修改稿\n\n保留 PDF 导出；新增 CSV 导出需求待确认。" } }] }; } },
    { ...readDraft, handle: (_caller, value) => db.prepare("SELECT * FROM drafts WHERE request_id=?").get((value as { request_id: string }).request_id) ?? null },
    { ...events, handle: () => ({ source: { surface: "feed", title: "来源事项", icon: "rss" }, events: [...context.entries()].filter(([,row])=>row.kind==="feed_item").map(([id,row])=>({event_id:id,subject:{kind:row.kind,id},occurred_at:"2026-09-26T02:00:00Z",placement:"occurred",category:"personal",title:row.title,summary:row.content,content:row.content,facts:[],needs_attention:true,open:null})) }) },
    { ...write, handle: (_caller, value) => { const input = value as { request_id: string; body: string }; writes++; db.prepare("INSERT OR IGNORE INTO drafts VALUES (?,?)").run(input.request_id, input.body); if (failAfterWrite) throw new Error("lost response"); return input; } },
  ] });
  const ports: PersonalAssistantPorts = { actions, home_provider_id: "system.home", inspectMaterial: async subject => {
    if (subject.kind !== "feed_item") return null; if (!connected) throw new Error("connection revoked");
    return { source_id: subject.id, name: subject.id === "rss" ? "公开 RSS" : "公开视频", connection_id: null, source_revision: "source-1", authorization_revision: null, external_id: subject.id, occurred_at: "2026-09-26T01:00:00Z", observed_at: "2026-09-26T02:00:00Z" };
  }, analysis: { analyze: async (input, caller, beforeDispatch) => { await beforeDispatch(); captured = input; generationCount++; return analysis(input, caller, beforeDispatch); } },
    recover: async (requestId, _offer, context) => { const row = await actions.invoke(context, { ...readDraft, provider_id: "fixture.materials" }, { request_id: requestId }); return row ? { title: "整理修改稿", result: row } : null; } };
  const store = new PersonalAssistantStore(db, "assistant-project", "tester"), make = () => new PersonalAssistantService(store, ports, "assistant-project", "tester", () => clock);
  const input = { changes: [{ kind: "feed_item", id: "rss" }, { kind: "feed_item", id: "youtube" }], project_materials: [{ kind: "goal", id: "goal" }] };
  return { db, context, store, service: make(), make, input, ports, get captured() { return captured; }, get writes() { return writes; }, get generationCount() { return generationCount; },
    setAnalysis(value: typeof analysis) { analysis = value; }, disconnect() { connected = false; }, loseResponse() { failAfterWrite = true; }, advance(ms: number) { clock = new Date(clock.getTime() + ms); }, close() { db.close(); } };
}
