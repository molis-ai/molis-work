import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { SURFACE_CONSEQUENCES, SURFACE_GENERIC_OPERATIONS } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceDescription, SurfaceExclusion, SurfaceGroup, SurfaceInstallationRef, SurfaceItem, SurfaceItemAction, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText, isRecord } from "./json-value.js";
import { textRefProblems, tryOwnedTextRef } from "./ui/text-ref.js";

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

const GROUP_KINDS = ["attention", "continue", "plugin", "slot", "outline"] as const;
const GROUP_KEYS = ["kind", "owner_plugin_id", "state", "read_at", "excluded", "hidden_above", "overflow", "plugin_card", "outline", "title", "items"] as const;
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
/** A word on the surface, bound to its owner by the service: it has an `owner` unless it is a `literal` (a-section §2.3, `owned: true`). */
function ownedText(value: unknown, part: string): OwnedTextRef {
  if (!isRecord(value) || textRefProblems(value, { owned: true }).length > 0) throw malformed(part);
  return value as OwnedTextRef;
}
function isSubject(value: unknown): value is ActionSubject {
  return isRecord(value) && typeof value.kind === "string" && typeof value.id === "string";
}
const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
/** Item facts the selection echoes; notices are taken directly from the candidate. */
const factsOf = (item: object) => canonicalJsonText(Object.fromEntries(Object.entries(item).filter(([key]) => key !== "actions" && key !== "notices")));

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
  const owned = kind === "plugin" || kind === "outline";
  if (owned !== (group.owner_plugin_id !== undefined)) throw malformed(`${at}.owner_plugin_id：plugin 组与 outline 组必有，别的组不写`);
  const ownerId = owned ? text(group.owner_plugin_id, `${at}.owner_plugin_id`, 200) : undefined;
  const owner = ownerId === undefined ? {} : { owner_plugin_id: ownerId };
  if ((state === "stale") !== (group.read_at !== undefined)) throw malformed(`${at}.read_at：stale 必有，别的状态不写`);
  const readAt = group.read_at === undefined ? {} : { read_at: timestamp(group.read_at, `${at}.read_at`) };
  const excluded = group.excluded === undefined ? {} : { excluded: exclusions(group.excluded, `${at}.excluded`) };
  const hidden = group.hidden_above === undefined ? {} : { hidden_above: hiddenAbove(group.hidden_above, `${at}.hidden_above`) };
  const folded = group.overflow === undefined ? {} : { overflow: overflow(group.overflow, `${at}.overflow`) };
  const card = group.plugin_card === undefined ? {} : { plugin_card: checkedPluginCard(group.plugin_card, ownerId, state, `${at}.plugin_card`) };
  if (!Array.isArray(group.items)) throw malformed(`${at}.items`);
  if ((kind === "plugin" || kind === "outline") && group.items.some(item => item.owner_plugin_id !== ownerId)) throw malformed(`${at}.items：plugin 组与 outline 组只放这个插件的东西`);
  const outline = checkedOutline(group, kind, `${at}.outline`);
  return { facts: { kind, ...owner, state, ...readAt, ...excluded, ...hidden, ...folded, ...card, ...outline }, offered: new Map(group.items.map(item => [subjectKey(item.subject), item])) };
}

/**
 * An `outline` group is one plugin's own tree of its objects with how far each has come: the nodes are the owner's, in its order, each
 * object once, a part only under a whole, and never more done than there is. Other groups carry none.
 */
function checkedOutline(group: SurfaceGroup, kind: SurfaceGroup["kind"], at: string): { outline?: NonNullable<SurfaceGroup["outline"]> } {
  if ((kind === "outline") !== (group.outline !== undefined)) throw malformed(`${at}：outline 组必有，别的组不写`);
  if (group.outline === undefined) return {};
  if (group.title === undefined) throw malformed(`${at}：outline 组必有标题`);
  if (!Array.isArray(group.outline) || group.outline.length < 1 || group.outline.length > PRESENTATION_LIMITS.outline_nodes) throw malformed(at);
  const seen = new Set<string>();
  const nodes = group.outline.map((value, index) => {
    const path = `${at}[${index}]`, node = closed(value, path, ["subject", "depth", "progress"]);
    if (!isSubject(node.subject) || seen.has(subjectKey(node.subject))) throw malformed(`${path}.subject`);
    seen.add(subjectKey(node.subject));
    if (node.depth !== 0 && node.depth !== 1 || index === 0 && node.depth !== 0) throw malformed(`${path}.depth`);
    const depth: 0 | 1 = node.depth;
    if (node.progress === undefined) return { subject: { kind: node.subject.kind, id: node.subject.id }, depth };
    const progress = closed(node.progress, `${path}.progress`, ["done", "total"]);
    if (!Number.isSafeInteger(progress.done) || !Number.isSafeInteger(progress.total) || (progress.done as number) < 0 || (progress.total as number) < (progress.done as number)) throw malformed(`${path}.progress`);
    return { subject: { kind: node.subject.kind, id: node.subject.id }, depth, progress: { done: progress.done as number, total: progress.total as number } };
  });
  return { outline: nodes };
}

/** A group of the value: the candidates' group of the same kind and owner, once. The value gives its title and picks and orders its items. */
function checkedGroup(value: unknown, at: string, pass: Pass): SurfaceGroup {
  const group = closed(value, at, GROUP_KEYS);
  const candidate = pass.candidates.find(entry => entry.facts.kind === group.kind && entry.facts.owner_plugin_id === group.owner_plugin_id);
  if (!candidate) throw malformed(`${at}：候选里没有这一组`);
  if (pass.placed.has(candidate)) throw malformed(`${at}：同一组放了两次`);
  if (group.plugin_card !== undefined && (candidate.facts.plugin_card === undefined
    || canonicalJsonText(group.plugin_card) !== canonicalJsonText(candidate.facts.plugin_card))) throw malformed(`${at}.plugin_card`);
  if (group.outline !== undefined && canonicalJsonText(group.outline) !== canonicalJsonText(candidate.facts.outline ?? null)) throw malformed(`${at}.outline`);
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
function overflow(value: unknown, at: string): { count: number; label?: OwnedTextRef } {
  const folded = closed(value, at, ["count", "label"]);
  return { count: count(folded.count, `${at}.count`), ...(folded.label === undefined ? {} : { label: ownedText(folded.label, `${at}.label`) }) };
}

function cardWord(value: unknown, owner: string, at: string, literal: boolean): void {
  const ref = ownedText(value, at);
  if ("literal" in ref) {
    if (!literal) throw malformed(at);
    return;
  }
  const { owner: named, ...word } = ref;
  const bound = tryOwnedTextRef(word, owner);
  if (!bound || !("owner" in bound) || bound.owner !== named) throw malformed(at);
}

function checkInstallation(value: unknown, at: string, expectedScope?: SurfaceInstallationRef["scope"]): void {
  const record = closed(value, at, ["scope", "install_id", "installation_generation", "version", "manifest_digest"]);
  const scope = oneOf(record.scope, ["project", "home"], `${at}.scope`);
  if (expectedScope && scope !== expectedScope) throw malformed(`${at}.scope`);
  for (const key of ["install_id", "installation_generation", "version", "manifest_digest"]) text(record[key], at + "." + key, 200);
}

function checkedCardAction(value: unknown, at: string) {
  const action = closed(value, at, ["ref", "provider_id", "primary", "consequence"]);
  const identity = actionIdentity(action, at);
  if (!identity.provider || !/^[^@\s]+@[1-9]\d*$/u.test(identity.ref)) throw malformed(at);
  if (action.consequence !== undefined && (!Array.isArray(action.consequence)
    || new Set(action.consequence).size !== action.consequence.length
    || action.consequence.some(value => !SURFACE_CONSEQUENCES.some(kind => kind === value)))) throw malformed(`${at}.consequence`);
  return identity;
}

function checkCardStarts(value: unknown, at: string): void {
  if (!Array.isArray(value) || !value.length || value.length > PRESENTATION_LIMITS.overview_start) throw malformed(at);
  const seen = new Set<string>();
  let primary = false;
  value.forEach((entry, index) => {
    const path = at + "[" + index + "]";
    const kind = oneOf(isRecord(entry) && entry.kind, ["invoke", "form"], `${path}.kind`);
    const base = ["kind", "installation", "action"];
    const start = closed(entry, path, kind === "form" ? [...base, "view_id", "panel"] : base);
    checkInstallation(start.installation, `${path}.installation`);
    if (kind === "form") {
      text(start.view_id, `${path}.view_id`, PRESENTATION_LIMITS.start_view_id);
      text(start.panel, `${path}.panel`, PRESENTATION_LIMITS.start_panel);
    }
    const action = checkedCardAction(start.action, `${path}.action`);
    if (seen.has(action.ref) || (primary && action.primary)) throw malformed(`${path}.action`);
    seen.add(action.ref);
    primary ||= action.primary;
  });
}

function checkCardEnable(value: unknown, at: string): void {
  const kind = oneOf(isRecord(value) && value.kind, ["project_membership", "project_installation", "home_plugin_settings"], `${at}.kind`);
  const base = ["kind", "installation"];
  const enable = closed(value, at, kind === "home_plugin_settings" ? base : [...base, "action", ...(kind === "project_membership" ? ["expected_revision"] : [])]);
  checkInstallation(enable.installation, `${at}.installation`, kind === "home_plugin_settings" ? "home" : "project");
  if (kind !== "home_plugin_settings") checkedCardAction(enable.action, `${at}.action`);
  if (kind === "project_membership") text(enable.expected_revision, `${at}.expected_revision`, PRESENTATION_LIMITS.revision);
}

function checkedPluginCard(value: SurfacePluginCard, owner: string | undefined, state: SurfaceGroup["state"], at: string): SurfacePluginCard {
  if (!owner) throw malformed(at);
  const card = closed(value, at, ["summary", "note", "start", "open", "enable", "lede"]);
  if ((state === "disabled" || state === "undeclared") && (card.summary !== undefined || card.start !== undefined || card.lede !== undefined)) throw malformed(at);
  if ((card.start !== undefined || card.lede !== undefined) && card.summary === undefined) throw malformed(at);
  if (card.lede !== undefined) checkCardLede(card.lede, owner, `${at}.lede`);
  if (card.summary !== undefined) cardWord(card.summary, owner, `${at}.summary`, true);
  if (card.note !== undefined) cardWord(card.note, owner, `${at}.note`, false);
  if (card.start !== undefined) checkCardStarts(card.start, `${at}.start`);
  if (card.open !== undefined) {
    const open = closed(card.open, `${at}.open`, ["kind", "installation", "view_id"]);
    if (open.kind !== "stage" || state === "disabled") throw malformed(`${at}.open`);
    checkInstallation(open.installation, `${at}.open.installation`);
    text(open.view_id, `${at}.open.view_id`, PRESENTATION_LIMITS.start_view_id);
  }
  if (card.enable !== undefined) {
    if (state !== "disabled") throw malformed(`${at}.enable`);
    checkCardEnable(card.enable, `${at}.enable`);
  }
  return value;
}

const codePoints = (value: string) => {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
};

/** A card's lede: the owner's own label (and invitation), and a few stored sentences, each standing on a few named sources. */
function checkCardLede(value: unknown, owner: string, at: string): void {
  const lede = closed(value, at, ["label", "as_of", "sentences", "invite"]);
  cardWord(lede.label, owner, `${at}.label`, false);
  if (lede.as_of !== undefined) timestamp(lede.as_of, `${at}.as_of`);
  if (!Array.isArray(lede.sentences) || lede.sentences.length > PRESENTATION_LIMITS.lede_sentences) throw malformed(`${at}.sentences`);
  lede.sentences.forEach((entry, index) => {
    const path = `${at}.sentences[${index}]`, sentence = closed(entry, path, ["text", "sources", "mark"]);
    // Lengths are counted as the overview's schema counts them (code points), so what the owner's answer passed is not refused here.
    if (typeof sentence.text !== "string" || !sentence.text.trim() || codePoints(sentence.text) > PRESENTATION_LIMITS.lede_sentence) throw malformed(`${path}.text`);
    if (sentence.sources !== undefined && (!Array.isArray(sentence.sources) || sentence.sources.length > PRESENTATION_LIMITS.lede_sources
      || new Set(sentence.sources).size !== sentence.sources.length || sentence.sources.some(source => typeof source !== "string" || !source || codePoints(source) > 200))) throw malformed(`${path}.sources`);
    if (sentence.mark !== undefined) oneOf(sentence.mark, ["yours", "changed", "gap"], `${path}.mark`);
  });
  if (lede.invite !== undefined) {
    const invite = closed(lede.invite, `${at}.invite`, ["text", "action"]);
    cardWord(invite.text, owner, `${at}.invite.text`, false);
    cardWord(invite.action, owner, `${at}.invite.action`, false);
  }
}

function actionIdentity(value: unknown, at: string): { ref: string; provider?: string; primary: boolean } {
  if (!isRecord(value) || typeof value.primary !== "boolean") throw malformed(at);
  const ref = text(value.ref, `${at}.ref`, PRESENTATION_LIMITS.action_ref);
  if (SURFACE_GENERIC_OPERATIONS.some(operation => operation === ref)) {
    if (value.provider_id !== undefined) throw malformed(`${at}.provider_id`);
    return { ref, primary: value.primary };
  }
  return { ref, provider: text(value.provider_id, `${at}.provider_id`, 200), primary: value.primary };
}

function checkNotices(value: unknown, at: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw malformed(at);
  value.forEach((entry, index) => {
    const path = `${at}[${index}]`;
    const notice = closed(entry, path, ["reason", "next"]);
    if (!isRecord(notice.reason) || textRefProblems(notice.reason, { owned: true, literal: false }).length) throw malformed(`${path}.reason`);
    if (notice.next !== undefined && !actionIdentity(notice.next, `${path}.next`).provider) throw malformed(`${path}.next.provider_id`);
  });
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
  if (offered.read_at !== undefined) {
    if (offered.state !== "stale") throw malformed(`${at}.read_at`);
    timestamp(offered.read_at, `${at}.read_at`);
  }
  checkNotices(offered.notices, `${at}.notices`);
  const refs = new Set<string>();
  const actions = value.actions.flatMap((action, index): SurfaceItemAction[] => {
    const path = `${at}.actions[${index}]`;
    const { ref, provider, primary } = actionIdentity(action, path);
    const key = JSON.stringify([ref, provider]);
    if (refs.has(key)) throw malformed(path);
    refs.add(key);
    const candidate = offered.actions.find(entry => entry.ref === ref && entry.provider_id === provider);
    if (!candidate) pass.dropped.push({ subject: offered.subject, action: ref });
    return candidate ? [{ ...candidate, primary }] : [];
  });
  if (actions.filter(action => action.primary).length > 1) throw malformed(`${at}.actions：至多一个 primary`);
  return [{ ...offered, actions }];
}
