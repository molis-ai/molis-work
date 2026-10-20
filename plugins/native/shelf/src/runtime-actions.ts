import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { ArtifactReference, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { type ShelfArtifactPreview, type ShelfItemRecord, type ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";

const text = { type: "string" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const reference = object({ artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } });
const preview = { type: "object", properties: { title: text, text, fingerprint: text, source: { type: "object" } }, required: ["title", "text", "fingerprint", "source"] };
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED): ActionDefinition<I, O> {
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences, permissions, subject_kinds: ["shelf_item", "artifact"], input_schema: input, output_schema: output } };
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
    { type: "object", required: ["item", "snapshot"] }, ["artifact:read", "storage:private"], ["user"]),
};
export const SHELF_RUNTIME_ACTIONS: readonly ActionDefinition[] = Object.values(shelfRuntimeActions);

export interface ShelfResultPorts {
  references(): ArtifactReference[];
  preview(record: FixedVersionRecord): ShelfArtifactPreview;
  receive(preview: ShelfArtifactPreview): Promise<{ item: ShelfItemRecord; snapshot: ShelfSnapshot }>;
}

/** What the artifact service refuses (a version that is not there) is the caller's mistake (400), not a failure of ours. */
const refused = <T>(run: () => T): T => {
  try { return run(); }
  catch (error) { throw error instanceof ActionError ? error : shelfErrors.invalid(error instanceof Error ? error.message : "Shelf 请求无效"); }
};

/** Owner-bound: the results land in the local user's personal Shelf. */
export function shelfRuntimeActionHandlers(context: PluginStartContext, results?: ShelfResultPorts): ActionHandlerBinding[] {
  const services = context.services;
  const read = (ref: ArtifactReference) => {
    if (!results) throw shelfErrors.unavailable("项目成果接收尚未装配");
    const record = refused(() => services?.artifacts?.read(ref));
    if (!record || record.lifecycle_state !== "active" || record.availability !== "available") throw shelfErrors.unavailable("原成果已归档、不可用或不存在");
    return results.preview(record);
  };
  return [
    bindOwnerPluginAction(context, shelfRuntimeActions.results, () => {
      if (!results) throw shelfErrors.unavailable("项目成果接收尚未装配");
      const connected = ["coding-report", "coding-changeset"].flatMap(port => { const ref = services?.inputs?.reference(port); return ref ? [ref] : []; });
      const seen = new Set<string>();
      return { results: [...connected, ...results.references()].flatMap(ref => {
        const key = JSON.stringify([ref.artifact_id, ref.version]); if (seen.has(key)) return []; seen.add(key);
        try { const value = read(ref); return [{ reference: value.source.reference, title: value.title, connected: connected.some(item => item.artifact_id === ref.artifact_id && item.version === ref.version) }]; }
        catch { return []; }
      }) };
    }),
    bindOwnerPluginAction(context, shelfRuntimeActions.preview, input => read(input.reference)),
    // Commands are rechecked by the owner binding before they run; the preview read and the start of the write below run in one turn, only the answer is awaited.
    bindOwnerPluginAction(context, shelfRuntimeActions.receive, input => {
      const value = read(input.reference);
      if (input.expected_fingerprint !== value.fingerprint) throw shelfErrors.conflict("成果与已查看的版本不一致，请重新预览后接收");
      return results!.receive(value);
    }),
  ];
}
