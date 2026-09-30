/**
 * Host-level read audit (specs/contextual-interaction §2.1): through the real action directory, can every plugin's
 * objects be listed and their content read by the Host? Uses the regenerable demo project of an isolated Home (create
 * it from settings first), adds every project plugin, creates one object per plugin with its own create action where
 * the input is simple (plus a few structured ones), then lists each search source and reads entries with the
 * provider's subject reader. Run with no server holding that Home:
 *
 *   MOLIS_WORK_SECRET_BACKEND=file MOLIS_WORK_HOME=<home> pnpm exec tsx scripts/contextual-slice/read-audit.mts <out.json> <home>
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { SEARCH_ENTRIES_INPUT_TYPE, SUBJECT_REFERENCE_TYPE, type ActionView, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { localWebActionContext } from "../../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../../apps/local-host/dist/local-owner-permissions.js";

const home = process.argv[3]!;
const project = await withCatalog({ homeDirectory: home }, async catalog => {
  const demo = catalog.listProjects().find(item => item.data_class === "regenerable_demo");
  if (!demo) throw new Error("这个 Home 里没有示例项目：先在设置里创建");
  for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) { try { catalog.addProjectPlugin({ project_id: demo.project_id, plugin_id, actor_id: "owner" }); } catch { /* already added */ } }
  return demo;
});
const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
const projectCaller: ActionCallContext = await localWebActionContext(host, ref, LOCAL_OWNER_PERMISSIONS);
const homeCaller: ActionCallContext = await localWebActionContext(host, undefined, LOCAL_OWNER_PERMISSIONS);
const scopes = [
  { name: "project", client: host.actionClient(ref), caller: projectCaller },
  { name: "home", client: host.homeActionClient(), caller: homeCaller },
];
// Structured creates for plugins whose create actions need more than a title.
{
  const client = host.actionClient(ref);
  const all = await client.discover(projectCaller);
  const call = async (id: string, input: Record<string, unknown>) => {
    const view = all.find(item => item.capability_id === id);
    if (!view) { console.log(`跳过 ${id}：不在目录里`); return; }
    try { await client.invoke(projectCaller, view, input); console.log(`已建 ${id}`); } catch (error) { console.log(`建 ${id} 失败：${(error as Error).message.slice(0, 80)}`); }
  };
  await call("jelly.note.create", { expected_revision: 0, title: "读取审计笔记", markdown: "新手引导要在十月上线，设计资源是主要风险。" });
  await call("jelly.inspiration.create", { expected_revision: 0, input_kind: "text", title: "读取审计灵感", raw_text: "试用第五天发一封个性化提醒邮件。" });
  await call("schedule.tasks.create", { title: "读取审计日程", instructions: "每天九点汇总前一天的试用转化数据", time: "09:00" });
  await call("alchemist.directions.create", { title: "读取审计方向", description: "研究试用期长短对付费转化的影响，比较三家竞品。" });
}

type Row = { provider: string; scope: string; created: string[]; create_failed: string[]; kinds: string[]; entries: number; read_ok: number; read_failed: string[]; sample?: { kind: string; title: string; chars: number; truncated: boolean; open?: unknown } };
const rows = new Map<string, Row>();
const row = (provider: string, scope: string) => { const key = `${scope}:${provider}`; if (!rows.has(key)) rows.set(key, { provider, scope, created: [], create_failed: [], kinds: [], entries: 0, read_ok: 0, read_failed: [] }); return rows.get(key)!; };

const simpleValue = (name: string, schema: Record<string, unknown>) => {
  if (schema.enum && Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.type === "string" || (Array.isArray(schema.type) && schema.type.includes("string"))) {
    if (/key|request|idempotency/.test(name)) return crypto.randomUUID();
    return name === "body" || name === "content" || name === "description" || name === "outcome" || name === "why"
      ? "读取审计样例正文：计划在十月完成新手引导，风险是设计资源紧张。" : "读取审计样例";
  }
  return undefined;
};

for (const scope of scopes) {
  let views: readonly ActionView[] = [];
  try { views = await scope.client.discover(scope.caller); } catch (error) { console.log(`${scope.name} 目录读取失败：${(error as Error).message}`); continue; }
  // Create one object per provider with a create action that takes only simple fields.
  for (const view of views.filter(item => item.operation === "command" && /\.create$|\.createMaterial$|materials\.create$/.test(item.capability_id))) {
    const schema = view.action.input_schema as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
    const input: Record<string, unknown> = {};
    let ok = true;
    for (const name of schema.required ?? []) { const value = simpleValue(name, schema.properties?.[name] ?? {}); if (value === undefined) { ok = false; break; } input[name] = value; }
    for (const name of ["title", "body", "name", "description"]) if (!(name in input) && schema.properties?.[name] && simpleValue(name, schema.properties[name]) !== undefined) input[name] = simpleValue(name, schema.properties[name]);
    const r = row(view.provider.provider_id, scope.name);
    if (!ok) { r.create_failed.push(`${view.capability_id}：必填字段不是简单文本`); continue; }
    try { await scope.client.invoke(scope.caller, view, input); r.created.push(view.capability_id); }
    catch (error) { r.create_failed.push(`${view.capability_id}：${(error as Error).message.slice(0, 60)}`); }
  }
  views = await scope.client.discover(scope.caller);
  const readers = views.filter(view => view.action.input_type === SUBJECT_REFERENCE_TYPE);
  for (const source of views.filter(view => view.action.input_type === SEARCH_ENTRIES_INPUT_TYPE)) {
    const r = row(source.provider.provider_id, scope.name);
    let entries: { subject: { kind: string; id: string }; title: string }[] = [];
    try { entries = ((await scope.client.invoke(scope.caller, source, { cursor: null, limit: 20 })) as { entries: typeof entries }).entries; }
    catch (error) { r.read_failed.push(`列出失败：${(error as Error).message.slice(0, 60)}`); continue; }
    r.entries += entries.length;
    for (const entry of entries.slice(0, 5)) {
      if (!r.kinds.includes(entry.subject.kind)) r.kinds.push(entry.subject.kind);
      const reader = readers.find(view => view.provider.provider_id === source.provider.provider_id && view.action.subject_kinds.includes(entry.subject.kind));
      if (!reader) { r.read_failed.push(`${entry.subject.kind}：没有读取动作`); continue; }
      try {
        const context = await scope.client.invoke(scope.caller, reader, { subject_id: entry.subject.id }) as { title: string; content: string; truncated: boolean; open?: unknown; subject: { kind: string } };
        r.read_ok += 1;
        r.sample ??= { kind: context.subject.kind, title: context.title.slice(0, 30), chars: context.content.length, truncated: context.truncated, ...(context.open ? { open: context.open } : {}) };
      } catch (error) { r.read_failed.push(`${entry.subject.kind}：${(error as Error).message.slice(0, 60)}`); }
    }
  }
}
const list = [...rows.values()].sort((a, b) => a.provider.localeCompare(b.provider));
for (const r of list) console.log(`${r.scope.padEnd(7)} ${r.provider.padEnd(32)} 新建=${r.created.length}${r.create_failed.length ? `（失败 ${r.create_failed.length}）` : ""} 对象=${r.entries} 读取成功=${r.read_ok}${r.read_failed.length ? ` 读取失败=${r.read_failed.length}` : ""} ${r.sample ? `样例：${r.sample.kind}「${r.sample.title}」${r.sample.chars}字` : ""}`);
writeFileSync(process.argv[2] ?? join(home, "read-audit.json"), JSON.stringify(list, null, 2) + "\n");
await host.close();
