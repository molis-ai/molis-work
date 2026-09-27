import { bindOwnerPluginAction, ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseShelfTextMaterial, type ShelfArtifactPreview, type ShelfItemRecord, type ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

const text = { type: "string" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const reference = object({ artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } });
const nullableReference = { anyOf: [reference, { type: "null" }] };
const preview = { type: "object", properties: { title: text, text, fingerprint: text, source: { type: "object" } }, required: ["title", "text", "fingerprint", "source"] };
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED): ActionDefinition<I, O> {
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences, permissions, subject_kinds: ["shelf_item", "artifact"], input_schema: input, output_schema: output } };
}

/** What this project's Runtime instance redeems: Coding results offered to Shelf, and which Shelf version the project uses as material. */
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
  output: define<Record<string, never>, { reference: ArtifactReference | null }>("material-output.read", "当前材料输出", "读取本项目当前作为 Shelf 材料输出的固定版本",
    "query", object({}), object({ reference: nullableReference }), ["artifact:read"]),
  selectOutput: define<{ reference: ArtifactReference; expected_reference: ArtifactReference | null }, { reference: ArtifactReference }>("material-output.select", "选择材料输出",
    "把一份已保存的 Shelf 材料版本设为本项目的材料输出；需提供查看时的当前输出以防覆盖", "command",
    object({ reference, expected_reference: nullableReference }), object({ reference }), ["artifact:read", "artifact:write"]),
};
export const SHELF_RUNTIME_ACTIONS: readonly ActionDefinition[] = Object.values(shelfRuntimeActions);

export interface ShelfResultPorts {
  references(): ArtifactReference[];
  preview(record: ArtifactVersionRecord): ShelfArtifactPreview;
  receive(preview: ShelfArtifactPreview): { item: ShelfItemRecord; snapshot: ShelfSnapshot };
}

/** Owner-bound: the results land in, and the output points at, the local user's personal Shelf. */
export function shelfRuntimeActionHandlers(context: PluginStartContext, results?: ShelfResultPorts): ActionHandlerBinding[] {
  const services = context.services;
  const read = (ref: ArtifactReference) => {
    if (!results) throw new ActionError("shelf.unavailable", "项目成果接收尚未装配");
    const record = services?.artifacts.read(ref);
    if (!record || record.lifecycle_state !== "active" || record.availability !== "available") throw new ActionError("shelf.unavailable", "原成果已归档、不可用或不存在");
    return results.preview(record);
  };
  const outputs = () => {
    if (!services?.outputs) throw new ActionError("shelf.unavailable", "项目材料输出尚未连接");
    return services.outputs;
  };
  return [
    bindOwnerPluginAction(context, shelfRuntimeActions.results, () => {
      if (!results) throw new ActionError("shelf.unavailable", "项目成果接收尚未装配");
      const connected = ["coding-report", "coding-changeset"].flatMap(port => { const ref = services?.inputs?.reference(port); return ref ? [ref] : []; });
      const seen = new Set<string>();
      return { results: [...connected, ...results.references()].flatMap(ref => {
        const key = JSON.stringify([ref.artifact_id, ref.version]); if (seen.has(key)) return []; seen.add(key);
        try { const value = read(ref); return [{ reference: value.source.reference, title: value.title, connected: connected.some(item => item.artifact_id === ref.artifact_id && item.version === ref.version) }]; }
        catch { return []; }
      }) };
    }),
    bindOwnerPluginAction(context, shelfRuntimeActions.preview, input => read(input.reference)),
    // Commands are rechecked by the owner binding before they run; the reads and writes below do not yield.
    bindOwnerPluginAction(context, shelfRuntimeActions.receive, input => {
      const value = read(input.reference);
      if (input.expected_fingerprint !== value.fingerprint) throw new ActionError("shelf.conflict", "成果与已查看的版本不一致，请重新预览后接收");
      return results!.receive(value);
    }),
    bindOwnerPluginAction(context, shelfRuntimeActions.output, () => ({ reference: outputs().reference("material") })),
    bindOwnerPluginAction(context, shelfRuntimeActions.selectOutput, input => {
      const record = services!.artifacts.read(input.reference);
      const material = parseShelfTextMaterial(record?.payload);
      if (input.reference.artifact_id !== "shelf-material:" + context.board_id + ":" + material.source.item_id) throw new ActionError("shelf.invalid", "Shelf 材料身份不一致");
      return { reference: outputs().select({ port: "material", reference: input.reference, expected_reference: input.expected_reference }) };
    }),
  ];
}
