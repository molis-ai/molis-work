import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { type ShelfArtifactPreview, type ShelfItemRecord, type ShelfSnapshot } from "@molis-ai/molis-work-module-shelf/contract";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";
import { codingResultDocument } from "@molis-ai/molis-work-contracts/modules/coding";
import { checkedDocument, shelfCopyOf } from "./coding-result.js";

const text = { type: "string" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const reference = object({ artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } });
const preview = { type: "object", properties: { title: text, text, fingerprint: text, source: { type: "object" } }, required: ["title", "text", "fingerprint", "source"] };
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED, scope: "home" | "project" = "project"): ActionDefinition<I, O> {
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope, scheduling: "concurrent", audiences, permissions, subject_kinds: ["shelf_item", "artifact"], input_schema: input, output_schema: output } };
}

/** What this project's Runtime instance redeems: Coding results offered to Shelf. */
export const shelfRuntimeActions = {
  results: define<Record<string, never>, { results: { reference: ArtifactReference; title: string; connected: boolean }[] }>("results.list", "可接收的项目成果",
    "列出本项目可放进 Shelf 的 Coding 报告与变更，标出已接到输入的版本", "query", object({}),
    object({ results: { type: "array", items: object({ reference, title: text, connected: { type: "boolean" } }) } }), ["artifact:read"]),
  preview: define<{ reference: ArtifactReference }, ShelfArtifactPreview>("results.preview", "预览项目成果", "读取一份固定版本成果将放进 Shelf 的正文与指纹",
    "query", object({ reference }), preview, ["artifact:read"]),
  // The answer repaints the personal panel, clipboard history included, so only that panel receives.
  receive: define<{ reference: ArtifactReference; expected_fingerprint: string }, { item: ShelfItemRecord; snapshot: ShelfSnapshot }>("results.receive", "把项目成果放进 Shelf",
    "按已预览的指纹把固定版本成果复制进置物架；成果变化时拒绝", "command", object({ reference, expected_fingerprint: { type: "string", minLength: 1 } }),
    { type: "object", required: ["item", "snapshot"] }, ["artifact:read", "storage:private", "shelf:read", "shelf:write", "actions:invoke"], ["user"]),
};
export const SHELF_RUNTIME_ACTIONS: readonly ActionDefinition[] = Object.values(shelfRuntimeActions);

/** Only Shelf's project instance delivers a checked fixed version to its Home store. */
export const shelfReceiveCopy = define<ShelfArtifactPreview, { item: ShelfItemRecord; snapshot: ShelfSnapshot }>(
  "results.copy", "保存 Shelf 成果副本", "接收同一插件项目实例校验的固定版本副本", "command", preview,
  { type: "object", required: ["item", "snapshot"] }, ["shelf:read", "shelf:write"], ["plugin"], "home");

/** What the artifact service refuses (a version that is not there) is the caller's mistake (400), not a failure of ours. */
const refused = async <T>(run: () => T | Promise<T>): Promise<T> => {
  try { return await run(); }
  catch (error) { throw error instanceof ActionError ? error : shelfErrors.invalid(error instanceof Error ? error.message : "Shelf 请求无效"); }
};

/** Owner-bound: the results land in the local user's personal Shelf. `manifest` is Shelf's own: its input ports and the types it consumes. */
export function shelfRuntimeActionHandlers(context: PluginStartContext,
  manifest: Pick<PluginManifest, "ports" | "artifacts" | "process_items">): ActionHandlerBinding[] {
  const services = context.services;
  const consumed = new Set([...manifest.artifacts.consumes, ...manifest.process_items?.consumes ?? []].map(type => type.artifact_type_id));
  // The version is read here, as this plugin; its text is the producer's own, asked for through the action this plugin consumes.
  const read = async (ref: ArtifactReference) => {
    const record = await refused(() => services?.artifacts?.read(ref));
    if (!record || record.lifecycle_state !== "active" || record.availability !== "available") throw shelfErrors.unavailable("原成果已归档、不可用或不存在");
    const actions = services?.actions, projectId = context.project_id;
    if (!actions || !projectId) throw shelfErrors.unavailable("项目成果接收尚未装配");
    const document = checkedDocument(await refused(() => actions.invoke(codingResultDocument, { reference: ref })));
    return shelfCopyOf(record, document, { project_id: projectId, project_path: `/projects/${encodeURIComponent(projectId)}` });
  };
  return [
    bindOwnerPluginAction(context, shelfRuntimeActions.results, async () => {
      const connected = (manifest.ports?.inputs ?? []).flatMap(({ port }) => { const ref = services?.inputs?.reference(port); return ref ? [ref] : []; });
      const listed = (services?.artifacts?.listConsumable() ?? []).filter(row => consumed.has(row.artifact_type_id)).map(({ artifact_id, version }) => ({ artifact_id, version }));
      const seen = new Set<string>(), rows: { reference: ArtifactReference; title: string; connected: boolean }[] = [];
      for (const ref of [...connected, ...listed]) {
        const key = JSON.stringify([ref.artifact_id, ref.version]); if (seen.has(key)) continue; seen.add(key);
        // A version its producer will not turn into text (archived, forged, another kind) is simply not offered.
        const value = await read(ref).catch(() => null);
        if (value) rows.push({ reference: value.source.reference, title: value.title, connected: connected.some(item => item.artifact_id === ref.artifact_id && item.version === ref.version) });
      }
      return { results: rows };
    }),
    bindOwnerPluginAction(context, shelfRuntimeActions.preview, input => read(input.reference)),
    // The owner binding confirms a command before it runs; the reads above wait on the producer, so the call is confirmed once more right before the write.
    bindOwnerPluginAction(context, shelfRuntimeActions.receive, async (input, beforeWrite) => {
      const value = await read(input.reference);
      if (input.expected_fingerprint !== value.fingerprint) throw shelfErrors.conflict("成果与已查看的版本不一致，请重新预览后接收");
      await beforeWrite();
      if (!services?.actions?.dependencies) throw shelfErrors.unavailable("成果接收动作服务不可用");
      return services.actions.dependencies.invoke<{ item: ShelfItemRecord; snapshot: ShelfSnapshot }>(
        { ...shelfReceiveCopy, provider_id: context.plugin_id }, value);
    }),
  ];
}
