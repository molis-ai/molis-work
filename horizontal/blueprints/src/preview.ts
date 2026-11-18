import { randomUUID } from "node:crypto";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BlueprintPart } from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { EffectiveSetting, SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import { blueprintsErrors, type BlueprintAdoptionPreviewInput, type BlueprintAdoptionPreviewResult,
  type BlueprintCurrentValue, type BlueprintDraftResult, type BlueprintPreviewPart } from "@molis-ai/molis-work-contracts/services/blueprints";
import { assertSandboxMatches, canonicalJsonText, inspectBlueprint } from "@molis-ai/molis-work-plugin-sdk";
import type { AdoptionStore, DiscoveredSetting, ObservedSetting, SettingBinding, SettingPlan } from "./store.js";

export interface SettingsAccess {
  discover(): Promise<readonly DiscoveredSetting[]>;
  read(binding: SettingBinding, keys: string[]): Promise<EffectiveSetting[]>;
  write(binding: SettingBinding, input: SettingsWriteInput): Promise<EffectiveSetting>;
}

export function sameBinding(left: SettingBinding, right: SettingBinding): boolean {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function previousValue(current: Extract<EffectiveSetting, { state: "ok" }>, layer: BlueprintPart["layer"]): SettingsWriteInput["change"] | undefined {
  if (current.layers) return Object.hasOwn(current.layers, layer) ? { set: current.layers[layer]! } : { inherit: true };
  if (current.source === layer) return { set: current.value };
  if (current.source === "provider_default" || layer === "project") return { inherit: true };
  return undefined;
}

/** A key is unique in the target scope. Never attribute a partial or ambiguous reply to an owner. */
export async function readOwnerValues(access: SettingsAccess, wanted: readonly Pick<SettingPlan, "binding" | "key">[], caller: ActionExecutionContext) {
  const groups = new Map<string, { binding: SettingBinding; keys: Set<string> }>();
  for (const { binding, key } of wanted) {
    const id = canonicalJsonText(binding, "null");
    let group = groups.get(id);
    if (!group) groups.set(id, group = { binding, keys: new Set() });
    group.keys.add(key);
  }
  const results = await Promise.all(Array.from(groups.values(), async ({ binding, keys }) => {
    try {
      const values = await access.read(binding, [...keys]);
      if (values.length === keys.size && new Set(values.map(v => v.key)).size === keys.size && values.every(v => keys.has(v.key))) return values;
    } catch {
      caller.assert_authority_current?.();
      caller.signal?.throwIfAborted();
    }
    return [];
  }));
  return new Map(results.flat().map(value => [value.key, value]));
}

async function readCandidates(access: SettingsAccess, wanted: ReadonlySet<string>, caller: ActionExecutionContext) {
  const declared = (await access.discover()).filter(item => wanted.has(item.entry.key));
  if (new Set(declared.map(item => item.entry.key)).size !== declared.length)
    throw blueprintsErrors.step_conflict("多个提供方声明了同一个设置，请先检查安装");
  const values = await readOwnerValues(access, declared.filter(item => !item.unavailable).map(({ entry, binding }) => ({ key: entry.key, binding })), caller);
  return new Map<string, ObservedSetting>(declared.map(item => [item.entry.key, { ...item, current: values.get(item.entry.key) }]));
}

function currentValue(current: EffectiveSetting | undefined, unavailable?: string): BlueprintCurrentValue {
  if (!current || current.state === "unavailable") return { state: "unavailable", reason: current?.reason ?? unavailable ?? "暂时读不到此设置" };
  return { state: "present", value: current.value, revision: current.revision, origin: null, setting_source: current.source };
}

export async function previewSettings(store: AdoptionStore, access: SettingsAccess, caller: ActionExecutionContext,
  input: BlueprintAdoptionPreviewInput, draft: BlueprintDraftResult["draft"], now: number, lifetime: number): Promise<BlueprintAdoptionPreviewResult> {
  if (input.upgrade_of || input.source.kind !== "draft") throw blueprintsErrors.part_unsupported("场景包版本升级尚未开放");
  if (input.target.kind === "current_project" && !caller.project_id) throw blueprintsErrors.part_unsupported("请选择目标项目");
  if (draft.source.revision !== input.source.revision) throw blueprintsErrors.step_conflict("草稿已经修改，请重新查看");
  const all = new Map(draft.blueprint.parts.map(part => [part.part_id, part]));
  const changes = new Map(input.changes?.map(change => [change.part_id, change]));
  const selected = new Set(input.part_ids);
  if (changes.size !== (input.changes?.length ?? 0) || selected.size !== input.part_ids.length
    || input.part_ids.some(id => !all.has(id)) || [...changes.keys()].some(id => !selected.has(id))) throw blueprintsErrors.part_unsupported("请检查所选部分是否重复或已离开当前草稿");
  const edited = draft.blueprint.parts.map(part => {
    const next = changes.get(part.part_id)?.proposal;
    if (!next) return part;
    if (next.kind !== part.proposal.kind || next.kind === "setting" && part.proposal.kind === "setting" && next.key !== part.proposal.key)
      throw blueprintsErrors.part_unsupported("只能修改同一部分和设置的建议");
    return { ...part, proposal: next };
  });
  const problems = inspectBlueprint({ ...draft.blueprint, parts: edited }, { source: "draft" });
  if (problems.length) throw blueprintsErrors.part_unsupported(problems[0]!.reason);
  const parts = edited.filter(part => selected.has(part.part_id));
  const found = await readCandidates(access, new Set(parts.flatMap(part => part.proposal.kind === "setting" ? [part.proposal.key] : [])), caller);
  const plans = new Map<string, SettingPlan>();
  const projected = parts.map((part): BlueprintPreviewPart => {
    const { part_id, layer, proposal } = part;
    const result = { part_id, layer, proposal, candidates: [], consequences: [],
      affected_step_ids: draft.blueprint.steps.filter(step => step.part_ids.includes(part_id)).map(step => step.step_id) };
    const change = changes.get(part_id), owner = proposal.kind === "setting" ? found.get(proposal.key) : undefined;
    if (change?.selection || change?.action && (!owner || canonicalJsonText(change.action) !== canonicalJsonText(owner.binding.write))) {
      throw blueprintsErrors.part_unsupported("只能选择预览中列出的设置主人");
    }
    if (!owner || proposal.kind !== "setting") return { ...result, decision: "skip", reason: "unsupported" };
    const { current, binding, entry } = owner;
    const title = "literal" in entry.title ? entry.title : { ...entry.title, owner: owner.text_owner };
    const summary = entry.summary && ("literal" in entry.summary ? entry.summary : { ...entry.summary, owner: owner.text_owner });
    const details = { ...result, title, ...(summary && { summary }), candidates: [{ kind: "owner" as const, action: binding.write, subject: { kind: "setting", id: entry.key }, current: currentValue(current, owner.unavailable) }],
      consequences: entry.consequence ?? [] };
    if (!entry.layers.includes(layer) || input.target.kind === "personal" && layer === "project") return { ...details, decision: "skip", reason: "scope_mismatch" };
    if (!current || current.state === "unavailable") return { ...details, decision: "skip", reason: "owner_unavailable" };
    const previous = previousValue(current, layer);
    if (!previous) return { ...details, decision: "skip", reason: "owner_unavailable" };
    assertSandboxMatches(entry.schema, proposal.value, (_kind, message) => { throw blueprintsErrors.part_unsupported(message); });
    plans.set(part_id, { binding, key: entry.key, layer, change: { set: proposal.value }, previous, expected_revision: current.revision });
    return { ...details, decision: "set" in previous && canonicalJsonText(previous.set) === canonicalJsonText(proposal.value) ? "reuse" : "update" };
  });
  const preview = { preview_id: randomUUID(), expires_at: new Date(now + lifetime).toISOString(), source: draft.source,
    target: input.target, locale: draft.locale, parts: projected };
  await caller.beforeEffect();
  caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
  store.savePreview(caller, preview, draft.blueprint.title, plans);
  return preview;
}
