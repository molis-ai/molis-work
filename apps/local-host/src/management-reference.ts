import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/** An action as a management entry names it: by id and version. Only the platform's protected review operations are served (44B). */
export type ManagementActionReference = Pick<ActionDefinition, "capability_id" | "version">;

/** The host decides who writes (the person on this machine, or a plugin's own call context); the arguments carry no identity. */
export function refusePayloadIdentity(input: object, more: readonly string[] = []): void {
  const named = ["actor_id", "actor_kind", ...more].filter(field => Object.hasOwn(input, field));
  if (named.length) {
    throw new ActionError("actions.input_invalid", `写入者由宿主确定（管理入口是本机这个人，插件取自调用上下文），参数里不能带 ${named.join("、")}`);
  }
}
