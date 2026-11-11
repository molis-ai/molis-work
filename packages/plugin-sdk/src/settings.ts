import {
  ActionError, bindActionHandler, requireSynchronous, type ActionCallContext, type ActionExecutionContext,
  type ActionHandlerBinding, type ActionMetadata, type ErrorCodeRaisers,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SETTINGS_SOURCES, type EffectiveSetting, type SettingEntryDeclaration, type SettingLayers,
  type SettingsDeclaration, type SettingsValues, type SettingsWriteInput,
} from "@molis-ai/molis-work-contracts/platform/settings";
import { isText } from "./action-declarations.js";
import { canonicalJsonText } from "./json-value.js";
import { assertJson, assertMatches, isJsonObject, type SandboxSchemaFailure } from "./sandbox-schema.js";
import { settingsActionProblems, type SettingsActions } from "./settings-declaration.js";

export interface SettingsOwnerScope {
  readonly owner_id: string;
  readonly actor_id: string;
  readonly project_id: string | null;
}

export type SettingSnapshot = { readonly key: string; readonly revision: string } & (
  | { readonly state: "ok"; readonly layers: SettingLayers }
  | { readonly state: "unavailable"; readonly reason: string }
);

export type SettingsRequestIdentity = Pick<SettingsWriteInput, "key" | "layer" | "request_id">;

export interface SettingsWriteReceipt {
  readonly request: SettingsWriteInput;
  readonly result: SettingsValues;
}

export interface SettingsTransaction {
  readReceipt(identity: SettingsRequestIdentity): SettingsWriteReceipt | undefined;
  /** The revision covers every layer and the provider default, including changes that restore a previous value. */
  readCurrent(key: string): SettingSnapshot;
  /** Enforce any owner-specific limits and update the layer's revision inside this transaction. */
  writeChange(input: Pick<SettingsWriteInput, "key" | "layer" | "change">): void;
  saveReceipt(identity: SettingsRequestIdentity, receipt: SettingsWriteReceipt): void;
}

export interface SettingsOwner {
  /** The bound installation or system provider, supplied by the registration. */
  readonly owner_id: string;
  readonly errors: ErrorCodeRaisers<{ setting_conflict: "conflict"; setting_invalid: "invalid" }>;
  read(scope: SettingsOwnerScope, keys: readonly string[]): readonly SettingSnapshot[] | Promise<readonly SettingSnapshot[]>;
  /** Open a durable write transaction before invoking run. Roll back values, revisions and receipts together if run throws. */
  transaction<R>(scope: SettingsOwnerScope, run: (transaction: SettingsTransaction) => R): R;
}

const invalidOutput = (reason: string) => new ActionError("actions.output_invalid", reason);
const invalidJsonOutput: SandboxSchemaFailure = (_kind, reason) => { throw invalidOutput(reason); };
const synchronous = "设置事务必须同步完成";

/** Preserve false, zero and null, and keep an unavailable snapshot separate from a provider default. */
export function resolveEffectiveSetting(snapshot: SettingSnapshot): EffectiveSetting {
  const { key, revision } = snapshot;
  if (!isText(key) || !isText(revision)) throw invalidOutput("设置读回缺少 key 或 revision");
  if (snapshot.state === "unavailable") {
    if (!isText(snapshot.reason)) throw invalidOutput("不可用的设置必须说明原因");
    return { key, revision, state: "unavailable", reason: snapshot.reason };
  }
  if (snapshot.state !== "ok" || !isJsonObject(snapshot.layers)) throw invalidOutput("设置各层读回无效");
  const layers: SettingLayers = {};
  for (const source of SETTINGS_SOURCES) {
    const value = snapshot.layers[source];
    if (value === undefined) continue;
    assertJson(value, invalidJsonOutput);
    layers[source] = value;
  }
  for (const source of SETTINGS_SOURCES) {
    const value = layers[source];
    if (value !== undefined) return { key, revision, state: "ok", value, source, layers };
  }
  return { key, revision, state: "unavailable", reason: "当前没有有效设置值" };
}

/** Bind the fixed actions to the owner's storage ports. The dispatcher validates the input and supplies the caller. */
export function bindSettingsHandlers(actions: SettingsActions, declaration: SettingsDeclaration, owner: SettingsOwner): {
  readonly read: ActionHandlerBinding;
  readonly write: ActionHandlerBinding;
} {
  const { owner_id } = owner;
  const entries = new Map(declaration.entries.map(entry => [entry.key, entry]));
  const actionProblems = settingsActionProblems(declaration, [actions.read, actions.write]);
  if (actionProblems.length || !isText(owner_id) || entries.size !== declaration.entries.length) {
    throw new ActionError("actions.definition_invalid", actionProblems.map(problem => problem.reason).join("；") || "设置动作缺少主人或有重复的 key");
  }
  const actionScope = actions.read.action.scope;
  return {
    read: bindActionHandler(actions.read, (input, caller) => readSettings(owner, ownerScope(owner_id, actionScope, caller), caller, entries, input.keys)),
    write: bindActionHandler(actions.write, (input, caller) => writeSetting(owner, ownerScope(owner_id, actionScope, caller), caller, entries, input)),
  };
}

function ownerScope(ownerId: string, actionScope: ActionMetadata["scope"], caller: ActionCallContext): SettingsOwnerScope {
  if (!caller.actor_id) throw new ActionError("actions.unauthenticated", "设置动作需要可信调用身份");
  if (actionScope === "project" && !caller.project_id) throw new ActionError("actions.project_required", "设置动作需要当前项目");
  return { owner_id: ownerId, actor_id: caller.actor_id, project_id: caller.project_id };
}

function assertCurrent(caller: ActionExecutionContext): void {
  requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
  caller.signal?.throwIfAborted();
}

async function readSettings(owner: SettingsOwner, scope: SettingsOwnerScope, caller: ActionExecutionContext,
  entries: ReadonlyMap<string, SettingEntryDeclaration>, requested: readonly string[]): Promise<SettingsValues> {
  const order = [...requested];
  const keys = [...new Set(order)];
  if (keys.some(key => !entries.has(key))) throw owner.errors.setting_invalid("请求读取未声明的设置");
  if (keys.length === 0) return { values: [] };
  const snapshots = await owner.read(scope, keys);
  assertCurrent(caller);
  const byKey = new Map(snapshots.map(snapshot => [snapshot.key, snapshot]));
  if (snapshots.length !== keys.length || byKey.size !== keys.length) throw invalidOutput("设置主人必须返回每个请求 key 的一份读回");
  return { values: order.map(key => resolveEffectiveSetting(currentSetting(byKey.get(key), key))) };
}

async function writeSetting(owner: SettingsOwner, scope: SettingsOwnerScope, caller: ActionExecutionContext,
  entries: ReadonlyMap<string, SettingEntryDeclaration>, input: SettingsWriteInput): Promise<SettingsValues> {
  if (caller.audience !== "user") throw new ActionError("actions.forbidden", "只有本人能写入设置");
  if (input.layer === "project" && !scope.project_id) throw owner.errors.setting_invalid("写入项目设置需要可信项目上下文");
  const { key, layer, expected_revision, request_id } = input;
  const invalidJson: SandboxSchemaFailure = (_kind, reason) => { throw owner.errors.setting_invalid(reason); };
  if ("set" in input.change) assertJson(input.change.set, invalidJson);
  const change = structuredClone(input.change);
  const request: SettingsWriteInput = { key, layer, expected_revision, request_id, change };
  const identity = { key, layer, request_id };
  await caller.beforeEffect();
  return requireSynchronous(owner.transaction(scope, transaction => {
    assertCurrent(caller);
    const saved = requireSynchronous(transaction.readReceipt(identity), synchronous);
    if (saved) {
      if (canonicalJsonText(saved.request) !== canonicalJsonText(request)) throw owner.errors.setting_conflict("同一个 request_id 已用于不同的设置请求");
      return saved.result;
    }
    const entry = entries.get(key);
    if (!entry?.layers.includes(layer)) throw owner.errors.setting_invalid("设置没有声明此写入层");
    const current = currentSetting(requireSynchronous(transaction.readCurrent(key), synchronous), key);
    if (current.revision !== expected_revision) throw owner.errors.setting_conflict("设置读取后已变化，请刷新再提交", { revision: current.revision });
    if ("set" in change) assertMatches(entry.schema, change.set, invalidJson);
    requireSynchronous(transaction.writeChange({ key, layer, change: structuredClone(change) }), synchronous);
    const readback = currentSetting(requireSynchronous(transaction.readCurrent(key), synchronous), key);
    const result = { values: [resolveEffectiveSetting(readback)] };
    requireSynchronous(transaction.saveReceipt(identity, { request, result }), synchronous);
    return result;
  }), synchronous);
}

function currentSetting(snapshot: SettingSnapshot | undefined, key: string): SettingSnapshot {
  if (!snapshot || snapshot.key !== key || !isText(snapshot.revision)) throw invalidOutput("设置主人返回了错误的 key 或 revision");
  return snapshot;
}
