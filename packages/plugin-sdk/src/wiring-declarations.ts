import {
  eventTypeKey, isReservedEventType, isValidEventTypeId, isValidEventTypeVersion, ownsEventType,
  type PluginEventsDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { isValidPortName, type PluginPortsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";

// The shape checks for a Manifest's `ports` and `events` blocks. `parsePluginManifest` is the one caller; they return every
// problem so an author sees the whole contract at once. Moved here from the contracts package (W3-03): they run code, so
// they live with the other Manifest rules in the SDK, and they are not part of the SDK's public exports.

/** Validate one Plugin's port and group declarations. Returns every problem. */
export function inspectPortDeclarations(ports: PluginPortsDeclaration | undefined): string[] {
  if (!ports) return [];
  const problems: string[] = [];
  const inputs = new Set<string>();
  for (const input of ports.inputs ?? []) {
    if (!isValidPortName(input.port)) {
      problems.push("输入端口名不合法");
      continue;
    }
    if (inputs.has(input.port)) {
      problems.push(`输入端口重复：${input.port}`);
      continue;
    }
    if (typeof input.artifact_type_id !== "string" || input.artifact_type_id.trim() === "") {
      problems.push(`输入端口 ${input.port} 缺少成果类型`);
      continue;
    }
    if (!Number.isSafeInteger(input.schema_version) || input.schema_version < 1) {
      problems.push(`输入端口 ${input.port} 的 schema_version 无效`);
      continue;
    }
    inputs.add(input.port);
  }

  const outputs = new Set<string>();
  for (const output of ports.outputs ?? []) {
    if (!isValidPortName(output.port)) {
      problems.push("输出端口名不合法");
      continue;
    }
    if (outputs.has(output.port)) {
      problems.push(`输出端口重复：${output.port}`);
      continue;
    }
    if (typeof output.artifact_type_id !== "string" || output.artifact_type_id.trim() === "") {
      problems.push(`输出端口 ${output.port} 缺少成果类型`);
      continue;
    }
    if (!Number.isSafeInteger(output.schema_version) || output.schema_version < 1) {
      problems.push(`输出端口 ${output.port} 的 schema_version 无效`);
      continue;
    }
    outputs.add(output.port);
  }

  const groups = new Set<string>();
  for (const group of ports.input_groups ?? []) {
    if (typeof group.group_id !== "string" || group.group_id.trim() === "") {
      problems.push("输入组缺少 ID");
      continue;
    }
    if (groups.has(group.group_id)) {
      problems.push(`输入组重复：${group.group_id}`);
      continue;
    }
    groups.add(group.group_id);
    if (!Array.isArray(group.ports) || group.ports.length === 0) {
      problems.push(`输入组 ${group.group_id} 必须至少包含一个端口`);
      continue;
    }
    for (const port of group.ports) {
      if (!inputs.has(port)) {
        problems.push(`输入组 ${group.group_id} 引用了未声明的输入端口 ${port}`);
      }
    }
  }
  return problems;
}

/**
 * Validate one Plugin's event declarations against its own identity. Returns
 * every problem so an author sees the whole contract, not the first failure.
 */
export function inspectEventDeclarations(
  pluginId: string,
  events: PluginEventsDeclaration | undefined,
): string[] {
  if (!events) return [];
  const problems: string[] = [];
  const published = new Set<string>();
  for (const item of events.publishes ?? []) {
    if (!isValidEventTypeId(item.event_type_id)) {
      problems.push("发布事件缺少合法类型 ID");
      continue;
    }
    if (!isValidEventTypeVersion(item.type_version)) {
      problems.push(`发布事件 ${item.event_type_id} 的版本无效`);
      continue;
    }
    if (isReservedEventType(item.event_type_id)) {
      problems.push(`不能发布宿主保留事件 ${item.event_type_id}`);
      continue;
    }
    if (!ownsEventType(pluginId, item.event_type_id)) {
      problems.push(`事件 ${item.event_type_id} 不属于 ${pluginId} 的命名空间`);
      continue;
    }
    const key = eventTypeKey(item.event_type_id, item.type_version);
    if (published.has(key)) problems.push(`发布事件重复：${key}`);
    published.add(key);
  }

  const subscribed = new Set<string>();
  for (const item of events.subscribes ?? []) {
    if (!isValidEventTypeId(item.event_type_id)) {
      problems.push("订阅事件缺少合法类型 ID");
      continue;
    }
    if (!isValidEventTypeVersion(item.type_version)) {
      problems.push(`订阅事件 ${item.event_type_id} 的版本无效`);
      continue;
    }
    if (!Array.isArray(item.from_plugin_ids) || item.from_plugin_ids.length === 0) {
      problems.push(`订阅 ${item.event_type_id} 必须显式限定来源插件`);
      continue;
    }
    const sources = new Set<string>();
    let ok = true;
    for (const source of item.from_plugin_ids) {
      if (typeof source !== "string" || source.trim() === "" || source.includes("*")) {
        problems.push(`订阅 ${item.event_type_id} 的来源声明无效`);
        ok = false;
        break;
      }
      if (sources.has(source)) {
        problems.push(`订阅 ${item.event_type_id} 的来源重复：${source}`);
        ok = false;
        break;
      }
      sources.add(source);
    }
    if (!ok) continue;
    const key = eventTypeKey(item.event_type_id, item.type_version);
    if (subscribed.has(key)) problems.push(`订阅事件重复：${key}`);
    subscribed.add(key);
  }
  return problems;
}
