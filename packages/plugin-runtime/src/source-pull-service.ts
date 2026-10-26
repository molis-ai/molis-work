import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  PLUGIN_EVIDENCE_READ_PERMISSION, PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION, PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION,
  type PluginSourcePullClient, type PluginSourceVocabulary, type RepositoryReadRequest, type RepositoryReadResult, type SourcePullKind, type SourcePullOptions, type SourcePullRequest, type SourcePullResult,
} from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly, type PluginInstance } from "./action-scope.js";

type InvocationScope = NonNullable<ReturnType<typeof currentPluginInvocation>>;

const errors = defineErrorCodes("plugin", {
  source_pull_call_required: "forbidden", source_pull_permission_undeclared: "forbidden", source_pull_action_not_concurrent: "forbidden",
  source_pull_read_only: "forbidden", source_pull_request_invalid: "invalid", source_pull_hold_invalid: "invalid",
});

const OPERATION_ID = /^[A-Za-z0-9._:-]{1,200}$/u;
const EVIDENCE_REF = /^molis-work-feed\/sha256\/[0-9a-f]{64}$/u;
/** The fields each kind of request may carry, and no others: where a pull goes is the platform's to decide, never an argument. */
const REQUEST_FIELDS: Readonly<Record<SourcePullKind, readonly string[]>> = Object.freeze({
  rss: ["kind", "operation_id", "source_name", "definition_id", "cursor"],
  custom_rss: ["kind", "operation_id", "source_name", "feed_url", "cursor"],
  youtube_channel: ["kind", "operation_id", "source_name", "channel_id", "cursor"],
  web_query: ["kind", "operation_id", "source_name", "query"],
});
const TEXT_FIELD: Readonly<Record<SourcePullKind, { readonly name: string; readonly max: number }>> = Object.freeze({
  rss: { name: "definition_id", max: 200 }, custom_rss: { name: "feed_url", max: 2_048 }, youtube_channel: { name: "channel_id", max: 200 }, web_query: { name: "query", max: 2_000 },
});
const permissionFor = (kind: SourcePullKind) => kind === "web_query" ? PLUGIN_SOURCE_PULL_QUERY_PERMISSION : PLUGIN_SOURCE_PULL_FEED_PERMISSION;
const PULL_PERMISSIONS = [PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION] as const;
/** `owner/name` as GitHub names them: each part starts with a letter or digit, so nothing here can read as a Git option or climb a path. */
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const REPOSITORY_SOURCE = /^[A-Za-z0-9_-]{1,100}$/u;

/** What the Host's side is handed for one pull. `hold` is the plugin's; everything else is the call's own state. */
export interface PluginSourcePullRun {
  /** Told the references of the bodies about to be written; the write waits for it. */
  hold(content_refs: readonly string[]): Promise<void>;
  readonly signal: AbortSignal;
  /** Throws when the call is no longer current (cancelled, revoked, stopped, ended). */
  current(): void;
  /** The same recheck, and the action's own, right before an effect (a body written, a record kept). */
  beforeEffect(): Promise<void>;
}

/** The Host's side: the request's route, the transports, the search records, the evidence store. No plugin code chooses any of them. */
export interface PluginSourcePullPort {
  plan(request: SourcePullRequest): { intent_fingerprint: string };
  pull(request: SourcePullRequest, run: PluginSourcePullRun): Promise<SourcePullResult>;
  readEvidence(content_ref: string): string | null;
  forget(operation_ids: readonly string[]): number;
  readRepository(request: RepositoryReadRequest, run: Pick<PluginSourcePullRun, "signal" | "current" | "beforeEffect">): Promise<RepositoryReadResult>;
  /** Pure: no I/O, no state. */
  readonly vocabulary: PluginSourceVocabulary;
}

export interface PluginSourcePullGate extends PluginInstance {
  assertActive(): void;
  requireGrant(permission: string): void;
}

/**
 * The client a plugin's `services.sourcePull` is. Authority comes from the call the plugin's code is running in, never from an
 * argument (as `services.connections`): this installation's own action declaring the permission (and `scheduling: "concurrent"` to
 * pull), or one of its kept jobs. Outside every call, in a scene, from another installation, and in a read-only call for the
 * methods that write, it refuses. The request is closed: a field the kind does not list is refused before anything leaves.
 */
export function createPluginSourcePullClient(manifest: PluginManifest, port: PluginSourcePullPort, gate: PluginSourcePullGate): PluginSourcePullClient {
  const declared = (permission: string) => manifest.permissions.some(item => item.permission === permission);
  const enter = (permissions: readonly string[], writes: boolean, concurrent: boolean) => {
    const scope = currentPluginInvocation();
    if (!scope || !inPluginInstance(scope, gate) || "scene" in scope) throw errors.source_pull_call_required("取数与证据读取只能在本插件自己的动作或后台作业里使用");
    const permission = permissions.find(item => scope.caller.permissions.includes(item) && ("definition" in scope ? scope.definition.action.permissions.includes(item) : true));
    if (!permission) throw errors.source_pull_permission_undeclared(`这次调用没有声明并持有 ${permissions.join(" 或 ")}`);
    if ("definition" in scope && concurrent && scope.definition.action.scheduling !== "concurrent") throw errors.source_pull_action_not_concurrent("取数的动作必须声明 scheduling: concurrent");
    if (writes && pluginInvocationReadOnly(scope)) throw errors.source_pull_read_only("只读调用里不能取数或忘记检索记录");
    return { scope, permission };
  };
  const currentFor = (scope: InvocationScope, permission: string, signal?: AbortSignal) => () => {
    signal?.throwIfAborted(); gate.assertActive(); gate.requireGrant(permission);
    assertCapturedPluginActionCurrent(scope, gate); signal?.throwIfAborted();
  };
  const entered = (request: unknown, writes: boolean) => {
    const checked = checkedRequest(request);
    return { checked, ...enter([permissionFor(checked.kind)], writes, writes) };
  };
  const client: { -readonly [Key in keyof PluginSourcePullClient]: PluginSourcePullClient[Key] } = {};
  if (PULL_PERMISSIONS.some(declared)) {
    client.plan = async request => {
      const { checked, scope, permission } = entered(request, false);
      currentFor(scope, permission)();
      return { intent_fingerprint: port.plan(checked).intent_fingerprint };
    };
    client.pull = async (request: SourcePullRequest, options: SourcePullOptions): Promise<SourcePullResult> => {
      if (!options || typeof options.hold !== "function") throw errors.source_pull_hold_invalid("取数必须带 hold：正文写下之前先登记");
      const { checked, scope, permission } = entered(request, true);
      const signal = AbortSignal.any([scope.caller.signal, options.signal].filter((item): item is AbortSignal => item !== undefined));
      const current = currentFor(scope, permission, signal);
      const beforeEffect = async () => { current(); if ("definition" in scope) await scope.caller.beforeEffect(); current(); };
      await beforeEffect();
      const result = await port.pull(checked, {
        signal, current, beforeEffect,
        async hold(content_refs) {
          if (!Array.isArray(content_refs) || content_refs.length === 0 || content_refs.length > 100 || !content_refs.every(ref => typeof ref === "string" && EVIDENCE_REF.test(ref))) {
            throw errors.source_pull_hold_invalid("登记的正文引用不合法");
          }
          current();
          await options.hold(Object.freeze([...new Set(content_refs)]));
          current();
        },
      });
      await beforeEffect();
      return structuredClone(result);
    };
    client.forget = async operation_ids => {
      if (!Array.isArray(operation_ids) || operation_ids.length > 1_000 || !operation_ids.every(id => typeof id === "string" && OPERATION_ID.test(id))) throw errors.source_pull_request_invalid("检索记录的操作号不合法");
      const { scope, permission } = enter(PULL_PERMISSIONS.filter(declared), true, false);
      const current = currentFor(scope, permission, scope.caller.signal);
      current();
      if ("definition" in scope) await scope.caller.beforeEffect();
      current();
      return { records_deleted: port.forget([...new Set(operation_ids)]) };
    };
  }
  if (declared(PLUGIN_SOURCE_PULL_FEED_PERMISSION)) {
    // Pure and read-only, so any call of this installation that holds the permission may ask; each answer is a copy of plain data.
    const vocabulary = port.vocabulary;
    const answer = <T>(use: () => T): T => {
      const { scope, permission } = enter([PLUGIN_SOURCE_PULL_FEED_PERMISSION], false, false);
      currentFor(scope, permission, scope.caller.signal)();
      return structuredClone(use());
    };
    const word = (value: unknown, max = 2_048): string => {
      if (typeof value !== "string" || value.length === 0 || value.length > max) throw errors.source_pull_request_invalid(`参数必须是 1 到 ${max} 个字符的文本`);
      return value;
    };
    const plain = (value: unknown): unknown => {
      try { return structuredClone(value); } catch { throw errors.source_pull_request_invalid("游标和回执必须是普通数据"); }
    };
    client.vocabulary = Object.freeze<PluginSourceVocabulary>({
      custom_rss_definition_id: vocabulary.custom_rss_definition_id, youtube_definition_id: vocabulary.youtube_definition_id, youtube_feed_host: vocabulary.youtube_feed_host,
      catalog: () => answer(() => vocabulary.catalog()),
      normalizeCustomRssUrl: value => answer(() => vocabulary.normalizeCustomRssUrl(word(value))),
      customRssHost: url => answer(() => vocabulary.customRssHost(word(url))),
      normalizeYouTubeChannel: value => answer(() => vocabulary.normalizeYouTubeChannel(word(value))),
      youTubeChannelFeedUrl: channel => answer(() => vocabulary.youTubeChannelFeedUrl(word(channel, 200))),
      isRssSourceKind: kind => answer(() => vocabulary.isRssSourceKind(word(kind, 200))),
      rssFailureCount: cursor => answer(() => vocabulary.rssFailureCount(plain(cursor))),
      rssCursorAfterFailure: cursor => answer(() => vocabulary.rssCursorAfterFailure(plain(cursor))),
      rssCursorAfterSuccess: (cursor, receipt, completedAt) => answer(() => vocabulary.rssCursorAfterSuccess(plain(cursor), receipt === null ? null : plain(receipt) as never, word(completedAt, 64))),
    });
  }
  if (declared(PLUGIN_EVIDENCE_READ_PERMISSION)) {
    client.evidence = Object.freeze({
      async read(content_ref: string): Promise<string | null> {
        if (typeof content_ref !== "string" || !EVIDENCE_REF.test(content_ref)) throw errors.source_pull_request_invalid("证据正文的引用不合法");
        const { scope, permission } = enter([PLUGIN_EVIDENCE_READ_PERMISSION], false, false);
        currentFor(scope, permission, scope.caller.signal)();
        return port.readEvidence(content_ref);
      },
    });
  }
  if (declared(PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION)) {
    client.repository = Object.freeze({
      async read(request: RepositoryReadRequest, options?: { readonly signal?: AbortSignal }): Promise<RepositoryReadResult> {
        const checked = checkedRepositoryRequest(request);
        const { scope, permission } = enter([PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION], true, true);
        const signal = AbortSignal.any([scope.caller.signal, options?.signal].filter((item): item is AbortSignal => item !== undefined));
        const current = currentFor(scope, permission, signal);
        const beforeEffect = async () => { current(); if ("definition" in scope) await scope.caller.beforeEffect(); current(); };
        await beforeEffect();
        const result = await port.readRepository(checked, { signal, current, beforeEffect });
        await beforeEffect();
        return structuredClone(result);
      },
    });
  }
  return Object.freeze(client);
}

/** The repository request's shape, settled before anything reaches the Host: two named fields, no others. */
function checkedRepositoryRequest(request: unknown): RepositoryReadRequest {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw errors.source_pull_request_invalid("仓库读取请求必须是对象");
  const value = request as Record<string, unknown>;
  const extra = Object.keys(value).filter(key => key !== "repository" && key !== "source_id");
  if (extra.length > 0) throw errors.source_pull_request_invalid(`仓库读取请求不认这些字段：${extra.join("、")}`);
  if (typeof value.repository !== "string" || !REPOSITORY.test(value.repository) || value.repository.includes("..")) throw errors.source_pull_request_invalid("仓库必须写成 owner/name");
  if (typeof value.source_id !== "string" || !REPOSITORY_SOURCE.test(value.source_id)) throw errors.source_pull_request_invalid("source_id 不合法");
  return { repository: value.repository, source_id: value.source_id };
}

/** The request's shape, settled once before anything reaches the Host: a known kind, only the fields that kind lists, bounded text. */
function checkedRequest(request: unknown): SourcePullRequest {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw errors.source_pull_request_invalid("取数请求必须是对象");
  const value = request as Record<string, unknown>, kind = value.kind;
  if (typeof kind !== "string" || !Object.hasOwn(REQUEST_FIELDS, kind)) throw errors.source_pull_request_invalid("取数请求的 kind 不认识");
  const allowed = REQUEST_FIELDS[kind as SourcePullKind];
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length > 0) throw errors.source_pull_request_invalid(`取数请求不认这些字段：${extra.join("、")}`);
  if (typeof value.operation_id !== "string" || !OPERATION_ID.test(value.operation_id)) throw errors.source_pull_request_invalid("operation_id 不合法");
  if (typeof value.source_name !== "string" || value.source_name.length === 0 || value.source_name.length > 200) throw errors.source_pull_request_invalid("source_name 必须是 1 到 200 个字符");
  const field = TEXT_FIELD[kind as SourcePullKind], text = value[field.name];
  if (typeof text !== "string" || text.length === 0 || text.length > field.max) throw errors.source_pull_request_invalid(`${field.name} 必须是 1 到 ${field.max} 个字符`);
  const base = { operation_id: value.operation_id, source_name: value.source_name };
  const cursor = value.cursor === undefined ? {} : { cursor: structuredClone(value.cursor) };
  if (kind === "web_query") return { kind, ...base, query: text };
  if (kind === "custom_rss") return { kind, ...base, feed_url: text, ...cursor };
  if (kind === "youtube_channel") return { kind, ...base, channel_id: text, ...cursor };
  return { kind: "rss", ...base, definition_id: text, ...cursor };
}
