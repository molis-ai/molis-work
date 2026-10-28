import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

// The shape of a Manifest's `notifications` (D6-2): the plugin takes the platform's notifications by one of its own actions. Only the
// shape and the action's reach are checked here; which installation the platform hands a notification to, and when, is for the platform
// while it runs (apps/local-host `plugin-notification-delivery.ts`). `parsePluginManifest` is the one caller.

export function notificationDeclarationProblems(value: unknown, actions: readonly ActionDefinition[] = []): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["notifications 必须为对象"];
  const extra = Object.keys(value).filter(field => field !== "receive");
  if (extra.length > 0) return [`notifications 不认这些字段：${extra.join("、")}`];
  const receive = value.receive;
  if (!isRecord(receive) || typeof receive.capability_id !== "string" || !Number.isInteger(receive.version) || (receive.version as number) < 1) {
    return ["notifications.receive 必须是 { capability_id, version }"];
  }
  const unknown = Object.keys(receive).filter(field => field !== "capability_id" && field !== "version");
  if (unknown.length > 0) return [`notifications.receive 不认这些字段：${unknown.join("、")}`];
  const definition = actions.find(item => item.capability_id === receive.capability_id && item.version === receive.version);
  if (!definition) return [`notifications.receive 指向的能力 ${receive.capability_id}@${String(receive.version)} 没有在 actions 里声明`];
  const problems: string[] = [];
  if (definition.operation !== "command") problems.push(`接收通知的能力 ${definition.capability_id} 必须是 command`);
  if (definition.action.audiences.length !== 1 || definition.action.audiences[0] !== "workflow") {
    problems.push(`接收通知的能力 ${definition.capability_id} 的受众只能是 workflow（平台以通知身份调用，别的受众不能发通知）`);
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
