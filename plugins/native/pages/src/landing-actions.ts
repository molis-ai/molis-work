import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema, type ItemAttachPosition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesRecord } from "./contract.js";
import { pagesErrors } from "./error.js";
import { landPagesText, type PagesLandingMode, type PagesLandingWrite } from "./landing.js";
import type { PagesStores } from "./store.js";

/**
 * 「放进左边」 for Pages (specs/context-program §14, §21.8 step 4): three writes into the document open on the left, at
 * the landing it reported. Each is its own action with its own `attach`, one handler between them; each is taken back by
 * `pages.revert`, the same as an agent's `update`. The person sees the preview at the landing and confirms first.
 */
const id = { type: "string", minLength: 1, pattern: "\\S" };
const position = { type: "integer", minimum: 0 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const input = { id, expected_version: { type: "integer", minimum: 1 }, anchor: position, head: position,
  text: { type: "string", minLength: 1, maxLength: 100_000, description: "要放进文档的纯文字，一行一段" } };
const source = object({ title: { type: "string", minLength: 1, maxLength: 200 }, url: { type: "string", maxLength: 2000 } }, ["title"]);

type LandingInput = Omit<PagesLandingWrite, "mode"> & { id: string; expected_version: number };
type LandingOutput = { document: PagesRecord; change_id: string };

function define(document: ActionSchema, mode: PagesLandingMode, verb: string, describe: string, positions: readonly ItemAttachPosition[]): ActionDefinition<LandingInput, LandingOutput> {
  return { capability_id: `pages.landing.${mode}`, version: 1, operation: "command", action: { title: verb, description: describe,
    kind: "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], permissions: ["pages:write"], subject_kinds: ["pages_document"],
    input_schema: object(mode === "quote" ? { ...input, source } : input), output_schema: object({ document, change_id: id }),
    result_subject: { id: "document.id", revision: "document.version" },
    attach: { attach_id: mode, item_kind: "pages_document", positions, title: "文档", verb, describe, material_field: "text" },
    undo: { capability_id: "pages.revert", version: 1, input: { change_id: "change_id" } } } };
}

/** `document` is the schema of a Pages document, the same one every Pages action returns. */
export const definePagesLandingActions = (document: ActionSchema) => ({
  insert: define(document, "insert", "插入到光标处", "把文字原样插入到打开的文档里光标所在处，没有光标就放在文末；不改动已有的文字", ["cursor", "end"]),
  replace: define(document, "replace", "替换选中的文字", "用这段文字替换打开的文档里选中的那段文字", ["selection"]),
  quote: define(document, "quote", "作为引用插入", "把文字作为引用块插入到打开的文档里光标处或文末，下方写明出处；适合别人的原话", ["cursor", "end"]),
});

export function createPagesLandingHandlers(actions: ReturnType<typeof definePagesLandingActions>, stores: PagesStores): ActionHandlerBinding[] {
  return Object.entries(actions).map(([mode, definition]) => ({
    capability_id: definition.capability_id, version: definition.version,
    handle: async (caller: ActionExecutionContext, value: unknown) => {
      const { id: pageId, expected_version, ...write } = value as LandingInput;
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
      const projectId = caller.project_id;
      // Cancelled or no longer allowed: nothing is written. The read, the check and the write are one step.
      return stores.write(caller, store => {
        const before = store.get(pageId, projectId);
        if (before.version !== expected_version) throw pagesErrors.conflict("文档已改变，请重新选择位置后再放进去");
        const body = landPagesText(before.body, { ...write, mode: mode as PagesLandingMode }) as PagesRecord["body"];
        const document = store.update(pageId, { body, expected_version }, projectId);
        return { document, change_id: store.keepChange(before, document) };
      });
    },
  }));
}
