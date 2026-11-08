import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceDescription, SurfaceExclusion, SurfaceGroup, SurfaceItem, SurfaceItemAction } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText, isRecord } from "./json-value.js";

// The check of a composed surface against its candidates (specs/shared-sources-and-surfaces §6, §7; SSC-10, IUI-05). The composition
// service runs it on the assistant's choice before showing it, and a plugin runs it in its tests on what is put on its page. The candidates
// are the deterministic composition; the value only picks among them, group by group (IUI-05). A malformed value throws, and the service
// shows the candidates instead; an item or action the candidates do not have in that group is dropped and recorded, never shown. A group's
// facts are the candidates', never the value's, so a self-check (the candidates as the value) holds the composition to the group rules.

/** Something left out because the candidates do not have it: an item, or with `action`, one action of an item that stays. */
export interface SurfaceDrop { readonly subject: ActionSubject; readonly action?: string }
export interface CheckedSurfaceDescription { readonly description: SurfaceDescription; readonly dropped: readonly SurfaceDrop[] }

// The message names the part and never echoes a value: a description names other owners' objects.
const malformed = (part: string) => new ActionError("actions.output_invalid", `操作面描述不合格：${part}`);

const GROUP_KINDS = ["attention", "continue", "plugin", "slot"] as const;
const GROUP_KEYS = ["kind", "owner_plugin_id", "state", "read_at", "excluded", "hidden_above", "title", "items"] as const;
const GROUP_STATES = ["ok", "unreadable", "stale", "disabled", "undeclared"] as const;

function closed(value: unknown, part: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) throw malformed(part);
  return value;
}
function oneOf<const T extends string>(value: unknown, allowed: readonly T[], part: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw malformed(part);
  return value as T;
}
function text(value: unknown, part: string, limit: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > limit) throw malformed(part);
  return value;
}
function count(value: unknown, part: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw malformed(part);
  return value as number;
}
/** A word on the surface, bound to its owner by the service. Only its shape is looked at here; the text tools of `/ui` check it in full. */
function ownedText(value: unknown, part: string): OwnedTextRef {
  if (!isRecord(value)) throw malformed(part);
  return value as OwnedTextRef;
}
function isSubject(value: unknown): value is ActionSubject {
  return isRecord(value) && typeof value.kind === "string" && typeof value.id === "string";
}
const subjectKey = (subject: ActionSubject) => `${subject.kind}\u0000${subject.id}`;
/** What an item is apart from its actions: the value has to give it exactly as a candidate does. */
const factsOf = (item: object) => canonicalJsonText(Object.fromEntries(Object.entries(item).filter(([key]) => key !== "actions")));

/** A candidate group: what the value has to take as it is, and the items it may pick from, by subject. */
interface CandidateGroup {
  readonly facts: Omit<SurfaceGroup, "title" | "items">;
  readonly offered: ReadonlyMap<string, SurfaceItem>;
}
interface Pass {
  readonly candidates: readonly CandidateGroup[];
  readonly placed: Set<CandidateGroup>;
  readonly shown: Set<string>;
  readonly dropped: SurfaceDrop[];
}

/**
 * The value as it may be shown, and what was dropped from it. Each group of the value is the candidates' group of the same kind and owner,
 * placed once, with that group's state, `read_at`, `excluded` and `hidden_above`. An item stays only in the group its candidate is in, with
 * the same subject, owner, form, state, fields and merged objects; in it, an action stays only when that candidate has its `ref`, and keeps
 * the candidate's prepared input and consequences. So the value decides the order of the groups, which items of each and in what order,
 * which actions and which one is primary, the titles and the reason, and nothing else. It keeps the candidates' corrections revision;
 * `composed_by` and `revision` are the value's as given, and the composition service sets the revision of what it shows (IUI-04, batch 15 S-1).
 */
export function assertSurfaceDescription(value: unknown, candidates: SurfaceDescription): CheckedSurfaceDescription {
  const description = closed(value, "描述", ["composed_by", "revision", "corrections_revision", "groups", "reason"]);
  const composedBy = oneOf(description.composed_by, ["rules", "assistant"], "composed_by");
  const revision = text(description.revision, "revision", PRESENTATION_LIMITS.revision);
  if (description.corrections_revision !== candidates.corrections_revision) throw malformed("corrections_revision");
  if (!Array.isArray(description.groups)) throw malformed("groups");
  const candidateGroups = candidates.groups.map((group, index) => candidateGroup(group, `候选 groups[${index}]`));
  const pass: Pass = { candidates: candidateGroups, placed: new Set(), shown: new Set(), dropped: [] };
  const groups = description.groups.map((group, index) => checkedGroup(group, `groups[${index}]`, pass));
  const reason = description.reason === undefined ? {} : { reason: ownedText(description.reason, "reason") };
  return { description: { composed_by: composedBy, revision, corrections_revision: candidates.corrections_revision, groups, ...reason }, dropped: pass.dropped };
}

/** The group rules, on the facts that are shown: `disabled` and `undeclared` and an owner only in a plugin group, whose items are all that plugin's; `read_at` exactly with `stale`. */
function candidateGroup(group: SurfaceGroup, at: string): CandidateGroup {
  const kind = oneOf(group.kind, GROUP_KINDS, `${at}.kind`);
  const state = oneOf(group.state, GROUP_STATES, `${at}.state`);
  if ((state === "disabled" || state === "undeclared") && kind !== "plugin") throw malformed(`${at}.state：${state} 只用在 plugin 组`);
  if ((kind === "plugin") !== (group.owner_plugin_id !== undefined)) throw malformed(`${at}.owner_plugin_id：plugin 组必有，别的组不写`);
  const ownerId = kind === "plugin" ? text(group.owner_plugin_id, `${at}.owner_plugin_id`, 200) : undefined;
  const owner = ownerId === undefined ? {} : { owner_plugin_id: ownerId };
  if ((state === "stale") !== (group.read_at !== undefined)) throw malformed(`${at}.read_at：stale 必有，别的状态不写`);
  const readAt = group.read_at === undefined ? {} : { read_at: timestamp(group.read_at, `${at}.read_at`) };
  const excluded = group.excluded === undefined ? {} : { excluded: exclusions(group.excluded, `${at}.excluded`) };
  const hidden = group.hidden_above === undefined ? {} : { hidden_above: hiddenAbove(group.hidden_above, `${at}.hidden_above`) };
  if (!Array.isArray(group.items)) throw malformed(`${at}.items`);
  if (kind === "plugin" && group.items.some(item => item.owner_plugin_id !== ownerId)) throw malformed(`${at}.items：plugin 组只放这个插件的东西`);
  return { facts: { kind, ...owner, state, ...readAt, ...excluded, ...hidden }, offered: new Map(group.items.map(item => [subjectKey(item.subject), item])) };
}

/** A group of the value: the candidates' group of the same kind and owner, once. The value gives its title and picks and orders its items. */
function checkedGroup(value: unknown, at: string, pass: Pass): SurfaceGroup {
  const group = closed(value, at, GROUP_KEYS);
  const candidate = pass.candidates.find(entry => entry.facts.kind === group.kind && entry.facts.owner_plugin_id === group.owner_plugin_id);
  if (!candidate) throw malformed(`${at}：候选里没有这一组`);
  if (pass.placed.has(candidate)) throw malformed(`${at}：同一组放了两次`);
  pass.placed.add(candidate);
  const title = group.title === undefined ? {} : { title: ownedText(group.title, `${at}.title`) };
  if (!Array.isArray(group.items)) throw malformed(`${at}.items`);
  const items = group.items.flatMap((item, index) => keptItem(item, `${at}.items[${index}]`, candidate.offered, pass));
  return { ...candidate.facts, ...title, items };
}

function timestamp(value: unknown, part: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw malformed(part);
  return value;
}
function exclusions(value: unknown, at: string): SurfaceExclusion[] {
  if (!Array.isArray(value)) throw malformed(at);
  return value.map((entry, index): SurfaceExclusion => {
    const exclusion = closed(entry, `${at}[${index}]`, ["reason", "count", "owner_plugin_id"]);
    if (exclusion.reason !== "disabled") throw malformed(`${at}[${index}].reason`);
    return { reason: "disabled", ...(exclusion.count === undefined ? {} : { count: count(exclusion.count, `${at}[${index}].count`) }),
      ...(exclusion.owner_plugin_id === undefined ? {} : { owner_plugin_id: text(exclusion.owner_plugin_id, `${at}[${index}].owner_plugin_id`, 200) }) };
  });
}
function hiddenAbove(value: unknown, at: string): { count: number; label: OwnedTextRef } {
  const hidden = closed(value, at, ["count", "label"]);
  return { count: count(hidden.count, `${at}.count`), label: ownedText(hidden.label, `${at}.label`) };
}

/** An item put in a group its candidate is not in, the attention group among them, is one the candidates do not have there: dropped. */
function keptItem(value: unknown, at: string, offeredHere: ReadonlyMap<string, SurfaceItem>, pass: Pass): SurfaceItem[] {
  if (!isRecord(value) || !isSubject(value.subject)) throw malformed(`${at}.subject`);
  const subject = value.subject;
  if (pass.shown.has(subjectKey(subject))) throw malformed(`${at}：同一个对象放了两次`);
  pass.shown.add(subjectKey(subject));
  const offered = offeredHere.get(subjectKey(subject));
  if (!offered || factsOf(value) !== factsOf(offered)) {
    pass.dropped.push({ subject: { kind: subject.kind, id: subject.id } });
    return [];
  }
  if (!Array.isArray(value.actions)) throw malformed(`${at}.actions`);
  const refs = new Set<string>();
  const actions = value.actions.flatMap((action, index): SurfaceItemAction[] => {
    if (!isRecord(action) || typeof action.ref !== "string" || typeof action.primary !== "boolean" || refs.has(action.ref)) throw malformed(`${at}.actions[${index}]`);
    refs.add(action.ref);
    const candidate = offered.actions.find(entry => entry.ref === action.ref);
    if (!candidate) pass.dropped.push({ subject: offered.subject, action: action.ref });
    return candidate ? [{ ...candidate, primary: action.primary }] : [];
  });
  if (actions.filter(action => action.primary).length > 1) throw malformed(`${at}.actions：至多一个 primary`);
  return [{ ...offered, actions }];
}
