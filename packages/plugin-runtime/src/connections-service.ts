import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  isPluginConnectionRecordKey, PLUGIN_CONNECTIONS_PERMISSION, type PluginConnectionDescription, type PluginConnectionMethod, type PluginConnectionRequest,
  type PluginConnectionResponse, type PluginConnectionsClient, type PluginConnectionSlotDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly, type PluginInstance } from "./action-scope.js";

const errors = defineErrorCodes("plugin", {
  connections_call_required: "forbidden", connections_permission_undeclared: "forbidden", connections_action_not_concurrent: "forbidden",
  connections_slot_undeclared: "invalid", connections_request_invalid: "invalid", connections_read_only: "forbidden",
  connections_record_key_invalid: "invalid", connections_project_required: "forbidden",
});

const METHODS: readonly PluginConnectionMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const MAX_URL = 8 * 1024, MAX_HEADERS = 32, MAX_HEADER_VALUE = 8 * 1024, MAX_BODY = 256 * 1024;
/** The person's credential is the Host's to add; a plugin cannot write one of its own beside or instead of it. */
const CREDENTIAL_HEADERS = new Set(["authorization", "proxy-authorization", "cookie"]);
/** Headers the connection itself owns. */
const TRANSPORT_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "keep-alive", "te", "trailer", "proxy-connection", "expect"]);
const HEADER_NAME = /^[a-z0-9!#$%&'*+.^_`|~-]{1,128}$/u;
/** Node's own rule for a header value: one it would throw on is refused here, as the plugin's error, before anything is sent. */
const HEADER_VALUE_INVALID = /[^\t\x20-\x7e\x80-\xff]/u;

/** One request as the Host's side receives it: checked, with only the fields it may send. */
export interface PluginConnectionDispatch {
  readonly url: URL;
  readonly method: PluginConnectionMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
  /** Recheck right before the request leaves (after its address is known) and before its answer is handed back. */
  beforeEffect(): Promise<void>;
}

/**
 * Which slot of which installation a request is for. The Host reads the binding under exactly this. A `per_record` slot's target also
 * names the project, always the call's own, and the plugin's record key; an installation slot's names neither.
 */
export interface PluginConnectionTarget {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly slot_id: string;
  readonly service_id: string;
  readonly project_id?: string;
  readonly record_key?: string;
}

/** The Host's side: binding, credential, origin and transport. No plugin code chooses any of them. */
export interface PluginConnectionsPort {
  request(target: PluginConnectionTarget, request: PluginConnectionDispatch): Promise<PluginConnectionResponse>;
  describe(target: PluginConnectionTarget): PluginConnectionDescription;
  /** Removes a `per_record` binding; it never adds or widens one. */
  release(target: PluginConnectionTarget): void;
}

export interface PluginConnectionsGate extends PluginInstance {
  /** The project this activation belongs to, when it belongs to one: a call from another project may not use its `per_record` slots. */
  readonly project_id?: string;
  assertActive(): void;
  requireGrant(permission: string): void;
}

/**
 * The client a plugin's `services.connections` is. Authority comes from the call the plugin's code is running in, never from an
 * argument: this instance's own action declaring `connections:use` (with `scheduling: "concurrent"` to send a request), or one of its
 * kept jobs declaring it. A route, `start`, `stop`, a timer outside every call, a scene and another installation's call are all refused,
 * and so is any method but GET and HEAD, and `release`, inside a read-only call. A `per_record` slot's record is the call's project's.
 */
export function createPluginConnectionsClient(manifest: PluginManifest, port: PluginConnectionsPort, gate: PluginConnectionsGate): PluginConnectionsClient {
  const slots = new Map((manifest.connections?.slots ?? []).map(slot => [slot.slot_id, slot]));
  const enter = (slot_id: unknown, record_key: unknown, sends: boolean) => {
    const scope = currentPluginInvocation();
    if (!scope || !inPluginInstance(scope, gate) || "scene" in scope) throw errors.connections_call_required("连接只能在本插件自己的动作或后台作业里使用");
    if ("definition" in scope) {
      if (!scope.definition.action.permissions.includes(PLUGIN_CONNECTIONS_PERMISSION)) throw errors.connections_permission_undeclared(`动作 ${scope.definition.capability_id} 没有声明 ${PLUGIN_CONNECTIONS_PERMISSION}`);
      if (sends && scope.definition.action.scheduling !== "concurrent") throw errors.connections_action_not_concurrent("使用连接的动作必须声明 scheduling: concurrent");
    }
    if (!scope.caller.permissions.includes(PLUGIN_CONNECTIONS_PERMISSION)) throw errors.connections_permission_undeclared(`这次调用没有 ${PLUGIN_CONNECTIONS_PERMISSION}`);
    const slot = typeof slot_id === "string" ? slots.get(slot_id) : undefined;
    if (!slot) throw errors.connections_slot_undeclared(`连接槽 ${String(slot_id)} 没有在 Manifest 的 connections.slots 里声明`);
    return { scope, slot, target: slotTarget(manifest, gate, slot, record_key, scope.caller.project_id) };
  };
  const currentFor = (scope: NonNullable<ReturnType<typeof currentPluginInvocation>>, signal?: AbortSignal) => () => {
    signal?.throwIfAborted(); gate.assertActive(); gate.requireGrant(PLUGIN_CONNECTIONS_PERMISSION);
    assertCapturedPluginActionCurrent(scope, gate); signal?.throwIfAborted();
  };
  return Object.freeze({
    async request(slot_id: string, request: PluginConnectionRequest): Promise<PluginConnectionResponse> {
      const { scope, target } = enter(slot_id, request?.record_key, true);
      const checked = connectionRequest(request);
      if (pluginInvocationReadOnly(scope) && checked.method !== "GET" && checked.method !== "HEAD") throw errors.connections_read_only("只读调用里只能发 GET 或 HEAD 请求");
      const signal = AbortSignal.any([scope.caller.signal, request?.signal].filter(item => item !== undefined));
      const current = currentFor(scope, signal);
      const beforeEffect = async () => { current(); if ("definition" in scope) await scope.caller.beforeEffect(); current(); };
      await beforeEffect();
      const response = await port.request(target, { ...checked, signal, beforeEffect });
      await beforeEffect();
      return response;
    },
    async describe(slot_id: string, record_key?: string): Promise<PluginConnectionDescription> {
      const { scope, target } = enter(slot_id, record_key, false);
      currentFor(scope, scope.caller.signal)();
      // Rebuilt from the three fields, so nothing else the Host's side might carry reaches the plugin.
      const { bound, display_name, state } = port.describe(target);
      return bound ? { bound, ...(display_name === undefined ? {} : { display_name }), ...(state === undefined ? {} : { state }) } : { bound };
    },
    async release(slot_id: string, record_key: string): Promise<void> {
      const { scope, slot, target } = enter(slot_id, record_key, false);
      if (slot.binding !== "per_record") throw errors.connections_record_key_invalid(`连接槽 ${slot.slot_id} 按安装绑定，账号只能由本人在设置里解除`);
      if (pluginInvocationReadOnly(scope)) throw errors.connections_read_only("只读调用里不能解除连接");
      const current = currentFor(scope, scope.caller.signal);
      current();
      if ("definition" in scope) await scope.caller.beforeEffect();
      current();
      port.release(target);
    },
  });
}

/** The binding a call reaches: an installation slot takes no record key; a `per_record` slot needs one, and the call's own project. */
function slotTarget(manifest: PluginManifest, gate: PluginConnectionsGate, slot: PluginConnectionSlotDeclaration, record_key: unknown,
  project_id: string | null): PluginConnectionTarget {
  const target = { plugin_id: manifest.plugin_id, install_id: gate.install_id, slot_id: slot.slot_id, service_id: slot.service_id };
  if (slot.binding !== "per_record") {
    if (record_key !== undefined) throw errors.connections_record_key_invalid(`连接槽 ${slot.slot_id} 按安装绑定，不带记录键`);
    return target;
  }
  if (!isPluginConnectionRecordKey(record_key)) throw errors.connections_record_key_invalid(`连接槽 ${slot.slot_id} 按记录绑定：记录键必须是 1 到 128 个字符，不含 /、: 和控制字符`);
  if (!project_id || (gate.project_id !== undefined && gate.project_id !== project_id)) throw errors.connections_project_required(`连接槽 ${slot.slot_id} 按记录绑定，只能在本项目的调用里使用`);
  return { ...target, project_id, record_key };
}

/** The request's shape, settled once before anything reaches the Host: an https address and the headers a plugin may write. */
function connectionRequest(request: PluginConnectionRequest): Omit<PluginConnectionDispatch, "signal" | "beforeEffect"> {
  if (!request || typeof request !== "object") throw errors.connections_request_invalid("请求必须是对象");
  const method = request.method ?? "GET";
  if (!METHODS.includes(method)) throw errors.connections_request_invalid(`不支持的请求方法：${String(method)}`);
  if (typeof request.url !== "string" || request.url.length > MAX_URL) throw errors.connections_request_invalid("网址必须是 8 KB 以内的文字");
  let url: URL;
  try { url = new URL(request.url); } catch { throw errors.connections_request_invalid("网址无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw errors.connections_request_invalid("只能请求不带账号密码和片段的 https 网址");
  const headers: Record<string, string> = {};
  const entries = Object.entries(request.headers ?? {});
  if (entries.length > MAX_HEADERS) throw errors.connections_request_invalid(`请求头至多 ${MAX_HEADERS} 个`);
  for (const [name, value] of entries) {
    const key = name.toLowerCase();
    if (CREDENTIAL_HEADERS.has(key)) throw errors.connections_request_invalid(`请求头 ${name} 由宿主决定：凭据只来自人绑定的账号`);
    if (TRANSPORT_HEADERS.has(key) || !HEADER_NAME.test(key)) throw errors.connections_request_invalid(`不能设置请求头 ${name}`);
    if (typeof value !== "string" || value.length > MAX_HEADER_VALUE || HEADER_VALUE_INVALID.test(value)) throw errors.connections_request_invalid(`请求头 ${name} 的值无效`);
    headers[key] = value;
  }
  if (request.body !== undefined) {
    if (method === "GET" || method === "HEAD") throw errors.connections_request_invalid(`${method} 请求不能带内容`);
    if (typeof request.body !== "string" || Buffer.byteLength(request.body) > MAX_BODY) throw errors.connections_request_invalid("请求内容必须是 256 KB 以内的文字");
  }
  return { url, method, headers, ...(request.body === undefined ? {} : { body: request.body }) };
}
