import { z } from "zod";
import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AlchemistStore } from "./store.js";
import { AlchemistError } from "./error.js";

const text = z.string(), id = text.min(1), object = z.strictObject;
const direction = object({ id, project_id: id, title: text, description: text, created_at: text, updated_at: text });
const card = object({ id, direction_id: id, project_id: id, origin: z.literal("demo"), status: z.enum(["candidate", "kept", "discarded"]), title: text, highlight: text,
  target_user: text, scenario: text, core_problem: text, core_mechanism: text, value_proposition: text, why_it_may_work: text,
  assumptions: z.array(text), unknowns: z.array(text), mvp_in: z.array(text), mvp_out: z.array(text), created_at: text, updated_at: text });
const decision = object({ id, card_id: id, project_id: id, choice: z.enum(["build", "hold", "drop"]), reason: text, created_at: text, updated_at: text });
const detail = object({ direction, cards: z.array(card), decisions: z.array(decision) });
function define<I extends z.ZodType, O extends z.ZodType>(name: string, title: string, input: I, output: O): ActionDefinition<z.input<I>, z.output<O>> {
  return { capability_id: `alchemist.legacy.${name}`, version: 1, operation: "query", action: { title,
    description: `${title}；仅历史演示数据，不作为真实生成或研究，不允许修改`, kind: "query", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    subject_kinds: ["alchemist"], permissions: ["alchemist:read"], input_schema: z.toJSONSchema(input, { target: "draft-7" }), output_schema: z.toJSONSchema(output, { target: "draft-7" }) } };
}
export const alchemistLegacyActions = {
  list: define("list", "历史演示方向列表", object({}), object({ directions: z.array(direction.extend({ card_count: z.number().int(), kept_count: z.number().int(), decision_count: z.number().int() })) })),
  get: define("get", "读取历史演示方向", object({ id }), detail),
  export: define("export", "导出历史演示数据", object({}), object({ label: z.literal("历史演示数据（不作为真实研究）"), directions: z.array(detail) })),
};
export function createAlchemistLegacyActionHandlers(withStore: <T>(run: (store: AlchemistStore) => T) => T): ActionHandlerBinding[] {
  return Object.entries(alchemistLegacyActions).map(([name, definition]) => ({ capability_id: definition.capability_id, version: definition.version,
    handle(caller, input) {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目。");
      try { return withStore(store => name === "list" ? { directions: store.list(caller.project_id!) }
        : name === "get" ? store.get((input as { id: string }).id, caller.project_id!)
        : { label: "历史演示数据（不作为真实研究）", directions: store.list(caller.project_id!).map(item => store.get(item.id, caller.project_id!)) }); }
      catch (error) { if (error instanceof AlchemistError) throw new ActionError(error.code, error.message); throw error; }
    },
  }));
}
