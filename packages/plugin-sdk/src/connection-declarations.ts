import { PLUGIN_CONNECTIONS_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";

// The shape of a Manifest's `connections` (S0b-2, S-57): the slots where the person may bind one of their accounts. Only the shape, the
// services and the permission are checked here; what a request may reach, and when, is for the platform while it runs
// (packages/plugin-runtime `createPluginConnectionsClient`). `parsePluginManifest` is the one caller.

/** The name a slot goes by, the same rule as a background job's. */
const SLOT_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const SLOT_FIELDS = new Set(["slot_id", "service_id", "reason", "binding"]);
const BINDINGS: readonly unknown[] = ["installation", "per_record"];

export function connectionDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  const declaresPermission = permissions.has(PLUGIN_CONNECTIONS_PERMISSION);
  if (value === undefined) return declaresPermission ? [`声明了 ${PLUGIN_CONNECTIONS_PERMISSION} 就要在 connections.slots 里写明用哪些账号`] : [];
  if (!isRecord(value)) return ["connections 必须为对象"];
  const extra = Object.keys(value).filter(field => field !== "slots");
  if (extra.length > 0) return [`connections 不认这些字段：${extra.join("、")}`];
  if (!Array.isArray(value.slots) || value.slots.length === 0) return ["connections.slots 至少要声明一项"];
  const problems: string[] = declaresPermission ? [] : [`声明连接槽要同时声明权限 ${PLUGIN_CONNECTIONS_PERMISSION}`];
  const seen = new Set<string>();
  for (const slot of value.slots) {
    if (!isRecord(slot) || typeof slot.slot_id !== "string" || !SLOT_ID.test(slot.slot_id)) {
      problems.push("连接槽的 slot_id 必须是小写字母开头、只含小写字母、数字和连字符、至多 64 个字符的名字");
      continue;
    }
    const id = slot.slot_id;
    if (seen.has(id)) { problems.push(`连接槽重复：${id}`); continue; }
    seen.add(id);
    const unknown = Object.keys(slot).filter(field => !SLOT_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`连接槽 ${id} 不认这些字段：${unknown.join("、")}`);
    if (typeof slot.reason !== "string" || slot.reason.trim().length === 0) problems.push(`连接槽 ${id} 要写明用途（reason）`);
    if (slot.binding !== undefined && !BINDINGS.includes(slot.binding)) problems.push(`连接槽 ${id} 的 binding 只能是 installation 或 per_record`);
    if (typeof slot.service_id !== "string" || !Object.hasOwn(CONNECTOR_REQUEST_SERVICES, slot.service_id)) {
      problems.push(`连接槽 ${id} 的 service_id 必须是平台登记了请求来源的服务：${Object.keys(CONNECTOR_REQUEST_SERVICES).join("、")}`);
    }
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
