import { actionEffect, type ActionCallContext, type ActionExecutionContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { isDeepStrictEqual } from "node:util";
import type { PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { AgentDelegationActionChoice, AgentDelegationCandidate, AgentDelegationOperationScope, AgentDelegationScope } from "@molis-ai/molis-work-contracts/services/agent-host";
import { canonicalJsonText, redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import { tryOwnedTextRef, UI_TEXT_UNAVAILABLE } from "@molis-ai/molis-work-plugin-sdk/ui";
import { actionDigest } from "@molis-ai/molis-work-service-agent-host";
import type { DirectoryWordResolver } from "@molis-ai/molis-work-ui-host";
import type { MolisWorkLocalHost } from "../project-host.js";
import { directoryWordResolver } from "../ui-text-provider.js";
import { assistantActionOwners } from "./assistant-action-delegation.js";
import { actionKey, actionReference, assistantActionContext, assistantActionRows, assistantActionScope } from "./assistant-authority.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";

type Owners = Awaited<ReturnType<typeof assistantActionOwners>>;
type Owner = NonNullable<ReturnType<Owners["owner"]>>;
type DisplayOperation = NonNullable<AgentDelegationCandidate["operations"]>[number];
type TargetValue = DisplayOperation["targets"][number]["values"][number];
type ScopeWord = (value?: TextRef) => string | undefined;
type Binding = { scope: AgentDelegationScope; operations?: readonly DisplayOperation[]; word?: ScopeWord };
type Candidate = Pick<AgentDelegationCandidate, "action" | "title" | "provider_title">;
type CandidateResolution = { candidate: Candidate; binding: Binding } | { unavailable: AgentDelegationCandidate };
type Target = { kind: string; id: string; field: string; assign(label: string): void };

class CandidateTargets {
  readonly #byKind = new Map<string, Owner | undefined>();
  readonly #read = new Map<Owner["reader"], Target[]>();
  readonly #checks = new Set<() => void>();
  constructor(private readonly owners: Owners) {}

  owner(kind: string) {
    if (!this.#byKind.has(kind)) this.#byKind.set(kind, this.owners.owner(kind));
    return this.#byKind.get(kind);
  }

  add(owner: Owner, targets: readonly Target[]): void {
    const rows = this.#read.get(owner.reader) ?? [];
    rows.push(...targets);
    this.#read.set(owner.reader, rows);
    this.#checks.add(owner.assertCurrent);
  }

  async read(host: MolisWorkLocalHost, context: ActionCallContext, work: StoredWork): Promise<void> {
    const project = work.project_ref, client = project ? host.actionClient(project, false) : host.homeActionClient();
    const distinct = new Set([...this.#read.values()].flatMap(rows => rows.map(({ kind, id }) => JSON.stringify([kind, id]))));
    if (distinct.size > PRESENTATION_LIMITS.values_subjects) throw assistantErrors.limit("一次最多选择 50 个授权对象");
    for (const [reader, rows] of this.#read) {
      const subjects = new Map(rows.map(({ kind, id }) => [JSON.stringify([kind, id]), { kind, id }]));
      const input = { subjects: [...subjects.values()], fields: [...new Set(rows.map(row => row.field))] };
      const reference = actionReference(reader), caller = { ...context, permissions: reader.action.permissions, allowed_actions: [reference] };
      const original = host.prepareActionReview(caller, reader, input, project);
      this.#checks.add(original.assertCurrent);
      const output = await client.invoke(caller, reference, input) as PresentationValues;
      const values = new Map(output.items.map(item => [JSON.stringify([item.subject.kind, item.subject.id]), item]));
      for (const row of rows) {
        const item = values.get(JSON.stringify([row.kind, row.id])), title = item?.values?.[row.field];
        if (item?.state === "ok" && typeof title === "string" && title.trim()) row.assign(title);
      }
    }
  }

  assertCurrent(): void { for (const check of this.#checks) check(); }
}

function objectBinding(view: ActionView, choice: Extract<AgentDelegationActionChoice, { kind: "objects" }>, targets: CandidateTargets,
  identity: Omit<Extract<AgentDelegationScope, { kind: "action-objects" }>, "kind" | "operations">, word: ScopeWord): Binding | string {
  const declaration = view.action.delegation;
  if (!declaration || declaration === "confirmation-only") return "这项操作没有可选的对象范围";
  const operations: AgentDelegationOperationScope[] = [], display: DisplayOperation[] = [];
  const reads: Array<[Owner, Target[]]> = [];
  const targetByKey = new Map(declaration.targets.map(target => [target.key, target]));
  for (const row of choice.operations) {
    const operation = declaration.operations.find(item => item.key === row.key);
    if (!operation || row.targets.length !== operation.targets.length || new Set(row.targets.map(target => target.key)).size !== row.targets.length) return "范围必须完整列出这项操作的目标";
    const resolved: Array<[string, AgentDelegationOperationScope["targets"][string]]> = [], shown: DisplayOperation["targets"][number][] = [];
    for (const { key, ids } of row.targets) {
      const target = targetByKey.get(key);
      if (!target || !operation.targets.includes(key) || !ids.length || ids.some(id => id !== id.trim() || id === "*" || target.allowed_values && !target.allowed_values.includes(id))) return "这项操作不能授权给所选目标";
      const empty = ids.length === 1 && ids[0] === "";
      if (!empty && ids.includes("")) return "根目录或不关联需要单独选择";
      const emptyTitle = empty ? target.empty_title : undefined;
      const owner = empty ? undefined : targets.owner(target.kind), field = owner?.titleField();
      if (empty ? !word(emptyTitle) : !owner || !field) return "无法确认目标归属或名称";
      const values: Array<{ id: string; label: TargetValue["label"] }> = ids.map(id => ({ id, label: emptyTitle ?? "" }));
      if (owner && field) reads.push([owner, values.map(value => ({ kind: target.kind, id: value.id, field, assign: label => { value.label = label; } }))]);
      resolved.push([key, { owner: owner?.identity ?? null, ids }]);
      shown.push({ key, title: target.title, ...(target.title_text ? { title_text: target.title_text } : {}), values });
    }
    operations.push({ key: row.key, targets: Object.fromEntries(resolved) });
    display.push({ key: row.key, title: operation.title, ...(operation.title_text ? { title_text: operation.title_text } : {}), targets: shown });
  }
  for (const [owner, rows] of reads) targets.add(owner, rows);
  return { scope: { kind: "action-objects", ...identity, operations }, operations: display, word };
}

function scopeWords(owner: string, resolve: DirectoryWordResolver): ScopeWord {
  return value => {
    const ref = value && tryOwnedTextRef(value, owner);
    if (!ref || !("key" in ref)) return undefined;
    const title = resolve(ref, ref.fallback ?? UI_TEXT_UNAVAILABLE), actual = title.trim();
    return actual && actual !== UI_TEXT_UNAVAILABLE ? title : undefined;
  };
}

function displayOperations(operations: readonly DisplayOperation[], word: ScopeWord): DisplayOperation[] {
  return operations.map(({ title_text, ...operation }) => ({
    ...operation, title: word(title_text) ?? operation.title,
    targets: operation.targets.map(({ title_text, ...target }) => ({
      ...target, title: word(title_text) ?? target.title,
      values: target.values.map(({ id, label }) => ({ id, label: typeof label === "string" ? label : word(label) ?? UI_TEXT_UNAVAILABLE })),
    })),
  }));
}

/** Read the Assistant's real action directory once, and read names by target owner, without running the proposed action. */
export async function resolveAssistantDelegationChoices(host: MolisWorkLocalHost, store: AssistantStore, work: StoredWork,
  caller: ActionExecutionContext, choices: readonly AgentDelegationActionChoice[]) {
  const checks = new Set<() => void>(), scopes: AgentDelegationScope[] = [];
  const assertCurrent = () => { for (const check of checks) check(); };
  if (!choices.length) return { candidates: [], scopes, assertCurrent, displayCandidates: () => [] };
  const base = assistantActionContext(work, { call_id: caller.call_id, locale: caller.locale, signal: caller.signal });
  const metadata = await host.inspectPreparedActionMetadata(base, work.project_ref);
  const context = assistantActionScope(base, assistantActionRows(metadata, base, store.disabledActions(work.actor_id)));
  const catalog = work.project_ref ? await host.actionClient(work.project_ref, false).discover(context) : await host.homeActionClient().discover(context);
  const owners = await assistantActionOwners(host, work, catalog), targets = new CandidateTargets(owners);
  const asked = new Map(catalog.map(view => [actionKey(actionReference(view)), view]));
  const confirmation = store.confirmAlways(work.actor_id);
  const resolve = async (choice: AgentDelegationActionChoice): Promise<CandidateResolution> => {
    const view = asked.get(actionKey(choice.action));
    const candidate = { action: choice.action, title: view?.action.title ?? "原操作", provider_title: view?.provider.title ?? "" };
    const unavailable = (reason: string): AgentDelegationCandidate => ({ ...candidate, state: "unavailable", reason });
    if (!view || view.operation !== "command" || actionEffect(view.action, view.capability_id) === "read") return { unavailable: unavailable("这项改动目前无法授权给助理") };
    if (!view.availability.available) return { unavailable: unavailable(view.availability.reason) };
    if (confirmation.has(actionKey(choice.action)) || view.action.delegation === "confirmation-only") return { unavailable: unavailable("这项操作需要本人确认") };
    if (choice.kind === "exact" && view.action.delegation === undefined) {
      try {
        const mcp = await host.connectorMcp?.holdTool(view);
        if (mcp) {
          const inputJson = canonicalJsonText(choice.input);
          if (!inputJson || inputJson.length > 12_000 || !isDeepStrictEqual(JSON.parse(inputJson), choice.input))
            return { unavailable: unavailable("完整操作参数超出可预览范围") };
          if (redactSecrets(inputJson) !== inputJson) return { unavailable: unavailable("参数包含敏感内容，这项操作需要本人逐次确认") };
          const original = host.prepareActionReview({ ...context, permissions: view.action.permissions }, view, choice.input, work.project_ref);
          const policy = store.policies.hold(work.actor_id, actionKey(choice.action), true);
          checks.add(() => {
            original.assertCurrent(); mcp.assertCurrent(); policy();
            if (store.disabledActions(work.actor_id).has(actionKey(choice.action)) || store.confirmAlways(work.actor_id).has(actionKey(choice.action)))
              throw assistantErrors.action_revoked("这项操作已关闭或改为每次确认");
          });
          return { candidate, binding: { scope: { ...mcp.scope, input_json: inputJson } } };
        }
      } catch { return { unavailable: unavailable("无法核对原连接与工具的授权范围") }; }
    }
    const provider = owners.installation(view.provider);
    if (!provider) return { unavailable: unavailable("无法确认原能力提供方的安装") };
    const identity = { action: actionReference(view), declaration_digest: actionDigest(view), provider_installation_generation: provider.generation };
    const assertPolicy = store.policies.hold(work.actor_id, actionKey(identity.action), true);
    const registered = () => {
      const latest = host.inspectActionMetadata(base, work.project_ref).find(row => actionKey(actionReference(row)) === actionKey(identity.action));
      if (latest?.action !== view.action || latest.provider !== view.provider) throw assistantErrors.action_revoked("原能力提供方已变化，请重新查看权限范围");
    };
    const fence = () => {
      assertPolicy(); registered();
      if (store.disabledActions(work.actor_id).has(actionKey(identity.action)) || store.confirmAlways(work.actor_id).has(actionKey(identity.action))) throw assistantErrors.action_revoked("这项操作已关闭或改为每次确认");
      provider.assertCurrent();
    };
    let binding: Binding | string;
    if (choice.kind === "objects") {
      const source = await provider.text();
      const word = scopeWords(provider.pluginId, directoryWordResolver(source?.reader ?? null, caller.locale));
      binding = objectBinding(view, choice, targets, identity, word);
    }
    else if (view.action.delegation !== undefined) binding = "请使用这项操作声明的范围";
    else {
      const inputJson = canonicalJsonText(choice.input);
      if (inputJson === undefined || inputJson.length > 12_000) return { unavailable: unavailable("完整操作参数超出可预览范围") };
      if (redactSecrets(inputJson) !== inputJson) return { unavailable: unavailable("参数包含敏感内容，这项操作需要本人逐次确认") };
      try {
        const held = host.prepareActionReview({ ...context, permissions: view.action.permissions }, view, choice.input, work.project_ref);
        checks.add(held.assertCurrent);
        binding = { scope: { kind: "action-exact", ...identity, input_json: inputJson } };
      } catch (error) { binding = error instanceof Error ? error.message : "无法核对完整操作参数"; }
    }
    if (typeof binding === "string") return { unavailable: unavailable(binding) };
    checks.add(fence);
    return { candidate, binding };
  };
  const resolved = await Promise.all(choices.map(resolve));
  await targets.read(host, context, work);
  checks.add(() => targets.assertCurrent());
  const candidates = resolved.map((row): AgentDelegationCandidate => {
    if ("unavailable" in row) return row.unavailable;
    if (row.binding.operations?.some(operation => operation.targets.some(target => target.values.some(value => value.label === "")))) {
      return { ...row.candidate, state: "unavailable", reason: "对象已删除或当前无法核对" };
    }
    scopes.push(row.binding.scope);
    const { scope, operations } = row.binding;
    return { ...row.candidate, state: "ready", ...(operations ? { operations } : {}),
      ...(scope.kind === "action-exact" || scope.kind === "mcp-exact" ? { exact_parameters: scope.input_json } : {}) };
  });
  assertCurrent();
  // The proposal digest uses the declaration and current object names. Localize those declarations only for display.
  const displayCandidates = () => candidates.map((candidate, index) => {
    const row = resolved[index]!;
    return candidate.operations && "binding" in row && row.binding.word
      ? { ...candidate, operations: displayOperations(candidate.operations, row.binding.word) }
      : candidate;
  });
  return { candidates, scopes, assertCurrent, displayCandidates };
}
