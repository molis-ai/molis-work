import { ActionError, isArtifactDocumentAction, isArtifactPreviewAction, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type ActionAudience, type FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { objectSchema as object, createActionDefinition, bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { type ShelfArtifactPreview, type ShelfItemRecord, type ShelfSnapshot } from "../contract.js";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfStore } from "../index.js";
import { shelfErrors } from "../index.js";
import { checkedDocument, documentFromPreview, shelfCopyOf } from "./result-document.js";

const text = { type: "string" };
const reference = object({ artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } });
const preview = { type: "object", properties: { title: text, text, fingerprint: text, source: { type: "object" } }, required: ["title", "text", "fingerprint", "source"] };
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
function define<I, O>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED, scope: "home" | "project" = "project"): ActionDefinition<I, O> {
  const keyBase = `shelf.action.${name.replaceAll(".", "-")}`;
  return createActionDefinition<I, O>(`shelf.${name}`, operation, { title, description,
    title_text: { key: `${keyBase}.title` }, description_text: { key: `${keyBase}.description` },
    scope, scheduling: "concurrent", audiences, permissions, subject_kinds: ["shelf_item", "artifact"], input_schema: input, output_schema: output }, version);
}

/** Coding results of the caller's project offered to Shelf: the Home instance reads them for the project each call is for (44B). */
export const shelfRuntimeActions = {
  results: define<Record<string, never>, { results: { reference: ArtifactReference; title: string }[] }>("results.list", /* @version action.shelf.results.list */ 1, "可接收的项目成果",
    "列出本项目可放进 Shelf 的 Coding 报告与变更", "query", object({}),
    object({ results: { type: "array", items: object({ reference, title: text }) } }), ["artifact:read"]),
  preview: define<{ reference: ArtifactReference }, ShelfArtifactPreview>("results.preview", /* @version action.shelf.results.preview */ 1, "预览项目成果", "读取一份固定版本成果将放进 Shelf 的正文与指纹",
    "query", object({ reference }), preview, ["artifact:read"]),
  // The answer repaints the personal panel, clipboard history included, so only that panel receives.
  receive: define<{ reference: ArtifactReference; expected_fingerprint: string }, { item: ShelfItemRecord; snapshot: ShelfSnapshot }>("results.receive", /* @version action.shelf.results.receive */ 1, "把项目成果放进 Shelf",
    "按已预览的指纹把固定版本成果复制进置物架；成果变化时拒绝", "command", object({ reference, expected_fingerprint: { type: "string", minLength: 1 } }),
    { type: "object", required: ["item", "snapshot"] }, ["artifact:read", "storage:private", "shelf:read", "shelf:write", "actions:invoke"], ["user"]),
};
export const SHELF_RUNTIME_ACTIONS: readonly ActionDefinition[] = Object.values(shelfRuntimeActions);

/** What the artifact service refuses (a version that is not there) is the caller's mistake (400), not a failure of ours. */
const refused = async <T>(run: () => T | Promise<T>): Promise<T> => {
  try { return await run(); }
  catch (error) { throw error instanceof ActionError ? error : shelfErrors.invalid(error instanceof Error ? error.message : "Shelf 请求无效"); }
};

/**
 * Owner-bound: the results land in the local user's personal Shelf. The 成果库 read is the caller's project's (`services.artifacts` of a
 * Home instance), and the producer's text comes through its declared document or preview role.
 */
export function shelfRuntimeActionHandlers(context: PluginStartContext, store: () => Pick<ShelfStore, "admit" | "snapshot">): ActionHandlerBinding[] {
  const services = context.services;
  // The version is read here, as this plugin; its text is discovered from the producer's declared document or preview role (Audit #10).
  // `projectId` is the caller's: a Home instance has no project of its own.
  const read = async (ref: ArtifactReference, projectId: string | null | undefined) => {
    const record = await refused(() => services?.artifacts?.read(ref));
    if (!record || record.lifecycle_state !== "active" || record.availability !== "available") throw shelfErrors.unavailable("原成果已归档、不可用或不存在");
    const dependencies = services?.actions?.dependencies;
    if (!dependencies || !projectId) throw shelfErrors.unavailable("项目成果接收尚未装配");
    const views = await refused(() => dependencies.discover());
    const owned = views.filter(view => view.availability.available && view.provider.plugin_id === record.producer_plugin_id);
    const docAction = owned.find(view => isArtifactDocumentAction(view.action));
    if (docAction) {
      const document = checkedDocument(await refused(() => dependencies.invoke({ capability_id: docAction.capability_id, version: docAction.version, provider_id: docAction.provider.provider_id }, { reference: ref })));
      return shelfCopyOf(record, document, { project_id: projectId, project_path: `/projects/${encodeURIComponent(projectId)}` });
    }
    const previewAction = owned.find(view => isArtifactPreviewAction(view.action));
    if (previewAction) {
      const preview = await refused(() => dependencies.invoke<FileContent>({ capability_id: previewAction.capability_id, version: previewAction.version, provider_id: previewAction.provider.provider_id }, { artifact: record }));
      return shelfCopyOf(record, documentFromPreview(record, preview), { project_id: projectId, project_path: `/projects/${encodeURIComponent(projectId)}` });
    }
    throw shelfErrors.unavailable("原成果的提供方当前未提供正文读取能力");
  };
  return [
    bindOwnerPluginAction(context, shelfRuntimeActions.results, async (_input, _beforeWrite, caller) => {
      const listed = (services?.artifacts?.listConsumable() ?? []).map(({ artifact_id, version }) => ({ artifact_id, version }));
      const rows: { reference: ArtifactReference; title: string }[] = [];
      for (const ref of listed) {
        // A version its producer will not turn into text (archived, forged, another kind) is simply not offered.
        const value = await read(ref, caller.project_id).catch(() => null);
        if (value) rows.push({ reference: value.source.reference, title: value.title });
      }
      return { results: rows };
    }),
    bindOwnerPluginAction(context, shelfRuntimeActions.preview, (input, _beforeWrite, caller) => read(input.reference, caller.project_id)),
    // The owner binding confirms a command before it runs; the reads above wait on the producer, so the call is confirmed once more right before the write.
    bindOwnerPluginAction(context, shelfRuntimeActions.receive, async (input, beforeWrite, caller) => {
      const value = await read(input.reference, caller.project_id);
      if (input.expected_fingerprint !== value.fingerprint) throw shelfErrors.conflict("成果与已查看的版本不一致，请重新预览后接收");
      await beforeWrite();
      const shelf = store(), item = await shelf.admit({ filename: `${value.title}.md`, bytes: Buffer.from(value.text), mime: "text/markdown", artifact_source: value.source });
      return { item, snapshot: await shelf.snapshot() };
    }),
  ];
}
