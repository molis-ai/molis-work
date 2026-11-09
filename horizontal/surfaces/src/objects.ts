import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { findSubjectReader, type ActionSubject, type ActionView, type SubjectReaderLookup } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS, type FormKind, type PresentationObject, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceGroup, SurfaceItem } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { actionErrorKind, compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { isPresentationValuesReader } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { ComposeRead } from "./composition.js";
import { operationsFor, ownsView } from "./operations.js";
import { subjectKey, viewKey, viewRevision, type SurfacePlugin } from "./ports.js";
import { formAt } from "./position.js";
import { mergeRelated } from "./relations.js";
import { readRuleValues } from "./values.js";

export type ObjectSource =
  | { subject: ActionSubject; kind: "request" }
  | { subject: ActionSubject; kind: "attention"; entry: AttentionSurfaceEntry }
  | { subject: ActionSubject; kind: "overview"; plugin: SurfacePlugin };

interface Candidate {
  subject: ActionSubject;
  plugin: SurfacePlugin;
  reader: SubjectReaderLookup;
  object?: PresentationObject;
  values?: ActionView;
  requested: boolean;
  inOverview: boolean;
  entries: AttentionSurfaceEntry[];
}

type ObjectRoute = Pick<Candidate, "reader" | "object" | "values"> & { plugin?: SurfacePlugin };

interface Projected {
  item: SurfaceItem;
  value?: PresentationValueItem;
  dependencies: readonly ActionView[];
  attention?: { entry: AttentionSurfaceEntry; rank: number };
  inOverview: boolean;
  pin: number;
  projectId: string | null;
}

function eligibleSources(read: ComposeRead, sources: readonly ObjectSource[]) {
  const subjects = new Map<string, ObjectSource[]>();
  const removed = new Set(read.corrections.corrections.flatMap(choice => choice.correction === "remove" && choice.subject ? [subjectKey(choice.subject)] : []));
  if (!read.position.forms.length) return subjects;
  for (const source of sources) {
    const key = subjectKey(source.subject);
    if (read.position.refuse.has(source.subject.kind) || removed.has(key)) continue;
    const existing = subjects.get(key);
    if (existing) existing.push(source);
    else subjects.set(key, [source]);
  }
  return subjects;
}

function objectRoutes(read: ComposeRead) {
  const { plugins, views } = read;
  const routes = new Map<string, ObjectRoute>();
  const values = views.filter(view => view.availability.available && isPresentationValuesReader(view));
  return (kind: string): ObjectRoute => {
    const existing = routes.get(kind);
    if (existing) return existing;
    const reader = findSubjectReader(views, kind);
    const view = reader.found === "one" || reader.found === "unavailable" ? reader.view : undefined;
    const plugin = view ? plugins.find(plugin => ownsView(plugin, view) && plugin.scope === view.action.scope) : undefined;
    const object = reader.found === "one" && plugin?.state === "running" && !plugin.home?.unavailable ? plugin.presentation?.objects.find(entry => entry.kind === kind) : undefined;
    const ownedValues = object && plugin ? values.filter(action => ownsView(plugin, action) && action.action.scope === view?.action.scope
      && action.action.subject_kinds.includes(kind)) : [];
    const route = { reader, plugin, object, values: ownedValues.length === 1 ? ownedValues[0] : undefined };
    routes.set(kind, route);
    return route;
  };
}

function pickCandidates(read: ComposeRead, sources: readonly ObjectSource[], routeFor: ReturnType<typeof objectRoutes>) {
  const { plugins, views } = read;
  const candidates: Candidate[] = [];
  // Attention records identify their owner plugin, not one of its installations.
  const switchedOff = (plugin: SurfacePlugin) => plugin.state === "disabled" && !plugin.home?.unavailable;
  const disabledOwners = new Set(plugins.filter(switchedOff).map(plugin => plugin.plugin_id));
  for (const plugin of plugins) if (!switchedOff(plugin)) disabledOwners.delete(plugin.plugin_id);
  const disabled = new Map<string, number>();
  const countDisabled = (owner: string) => disabled.set(owner, (disabled.get(owner) ?? 0) + 1);
  let unproved = false;

  for (const offers of eligibleSources(read, sources).values()) {
    const subject = offers[0]!.subject;
    const requested = offers.some(source => source.kind === "request");
    const facts = offers.flatMap(source => source.kind === "attention" ? [source.entry] : []);
    for (const owner of new Set(facts.map(entry => entry.owner_plugin_id))) {
      if (disabledOwners.has(owner)) countDisabled(owner);
    }
    const route = routeFor(subject.kind);
    const { reader } = route;
    const view = reader.found === "one" || reader.found === "unavailable" ? reader.view : undefined;
    const fallback = view || !requested ? [] : plugins.filter(plugin => views.some(action => ownsView(plugin, action)
      && action.action.search_source?.kinds.some(kind => kind.kind === subject.kind)));
    const plugin = route.plugin ?? (fallback.length === 1 ? fallback[0] : undefined);
    const entries = facts.filter(entry => entry.owner_plugin_id === plugin?.plugin_id);
    const inOverview = offers.some(source => source.kind === "overview" && source.plugin === plugin);
    if (!plugin || (!requested && !entries.length && !inOverview)) {
      if (requested) unproved = true;
      continue;
    }
    if (plugin.state !== "running") {
      if (requested) {
        if (plugin.state === "disabled") countDisabled(plugin.plugin_id);
        else unproved = true;
      }
      continue;
    }
    candidates.push({ ...route, subject, plugin, entries, inOverview, requested });
  }
  return { candidates, disabled, unproved };
}

function attentionRank(entry: AttentionSurfaceEntry, object: PresentationObject | undefined, status: string | undefined): number {
  if (entry.reason === "goal_decision") return 0;
  if (entry.reason === "source_fault" || entry.reason === "artifact_out_failed") return 2;
  const category = status === undefined ? undefined : object?.status?.map[status]?.attention;
  return category === "needs_decision" ? 0 : category === "needs_acceptance" ? 1 : category === "failed" ? 2 : 3;
}

const compareAttention = (left: NonNullable<Projected["attention"]>, right: NonNullable<Projected["attention"]>) =>
  left.rank - right.rank || Date.parse(right.entry.entered_at) - Date.parse(left.entry.entered_at);

function compareProjected(left: Projected, right: Projected): number {
  if (left.attention && right.attention) return compareAttention(left.attention, right.attention);
  if (left.attention || right.attention) return left.attention ? -1 : 1;
  return left.pin - right.pin;
}

interface RuleAnswer { item?: PresentationValueItem; denied?: true }

function stateFor(candidate: Candidate, answer: RuleAnswer | undefined): SurfaceItem["state"] {
  if (answer?.item) return answer.item.state;
  if (answer?.denied) return "forbidden";
  const availability = candidate.reader.found === "unavailable" ? candidate.reader.view.availability : undefined;
  return availability && !availability.available && actionErrorKind({ code: availability.code, message: availability.reason }) === "forbidden" ? "forbidden" : "stale";
}

function renderCandidate(candidate: Candidate, answer: RuleAnswer | undefined, read: ComposeRead): Projected | undefined {
  const { request, position, delivered, corrections, views, ports } = read;
  const { subject, plugin, object } = candidate;
  const key = subjectKey(subject);
  const choices = corrections.corrections.filter(choice => choice.subject && subjectKey(choice.subject) === key);
  const value = answer?.item, state = stateFor(candidate, answer);
  const readable = value?.state === "ok" || (value?.state === "stale" && value.read_at !== undefined);
  if (!candidate.requested && !readable) return undefined;
  const base: FormKind = request.slot.kind === "conversation" ? delivered.has(key) ? "card" : "chip"
    : request.slot.kind === "home" ? "row" : position.forms.at(-1)!;
  const chosenForm = [choices.find(choice => choice.correction === "form")?.form,
    corrections.corrections.find(choice => choice.correction === "form" && !choice.subject)?.form].find(form => form && position.forms.includes(form)) ?? base;
  const display = formAt(position, chosenForm, readable ? object : undefined);
  const status = object?.status ? value?.values?.[object.status.field] : undefined;
  const ruleStatus = typeof status === "string" ? status : undefined;
  const fallbackOpen = !object && candidate.reader.found === "one";
  const { actions, notices, dependencies } = readable && object && display.fields.length ? operationsFor(object, plugin, display.form, request.slot, ruleStatus, views, ports.diagnostic)
    : { actions: readable || fallbackOpen ? [{ ref: "open", primary: false }] : [], notices: undefined, dependencies: [] };
  const attention = candidate.entries.map(entry => ({ entry, rank: attentionRank(entry, object, ruleStatus) })).sort(compareAttention)[0];
  const item: SurfaceItem = { subject, owner_plugin_id: plugin.plugin_id, state, ...display,
    actions: request.slot.kind === "home" && !attention ? actions.map(action => ({ ...action, primary: false })) : actions,
    ...(notices ? { notices } : {}), ...(state === "stale" && value?.read_at ? { read_at: value.read_at } : {}) };
  return { item, ...(readable ? { value } : {}), attention, inOverview: candidate.inOverview, dependencies,
    pin: choices.find(choice => choice.correction === "pin")?.position ?? PRESENTATION_LIMITS.values_subjects,
    projectId: candidate.values?.action.scope === "home" ? null : ports.caller.project_id };
}

export function groupState(projected: readonly Projected[], unreadable: boolean): Pick<SurfaceGroup, "state" | "read_at"> {
  if (unreadable) return { state: "unreadable" };
  if (projected.length && projected.every(row => row.item.state === "stale" && row.item.read_at)) {
    return { state: "stale", read_at: projected.map(row => row.item.read_at!).sort((a, b) => Date.parse(a) - Date.parse(b))[0] };
  }
  return { state: "ok" };
}

export function readAttention(read: ComposeRead) {
  read.current();
  if (!read.deadline.active) return { sources: [], unreadable: true };
  try {
    return { sources: read.ports.attention().map(entry => ({ subject: entry.subject, kind: "attention", entry } satisfies ObjectSource)), unreadable: false };
  } catch (error) {
    read.current();
    if (actionErrorKind(error) === "forbidden") throw error;
    return { sources: [], unreadable: true };
  }
}

function readViews(candidates: readonly Candidate[]): ActionView[] {
  return candidates.flatMap(({ reader, values }) => reader.found === "one" ? [reader.view, ...(values ? [values] : [])] : []);
}

export function retainDisplayedOperations(read: ComposeRead, rows: readonly Projected[]) {
  const selected = [...new Set(rows.flatMap(row => row.dependencies))];
  read.retain(selected);
  return selected.sort((a, b) => compareCodeUnits(viewKey(a), viewKey(b))).map(viewRevision);
}

export async function composeObjects(read: ComposeRead, sources: readonly ObjectSource[]) {
  const { ports, request, plugins, deadline, current, retain } = read;
  const { candidates, disabled, unproved } = pickCandidates(read, sources, objectRoutes(read));
  const readers = request.slot.kind === "home" ? candidates.filter(candidate => candidate.values) : candidates;
  retain(readViews(readers));
  const answers = await readRuleValues(candidates.flatMap(candidate => candidate.values && candidate.object
    ? [{ subject: candidate.subject, action: candidate.values, object: candidate.object }] : []), ports, deadline, current);
  let unreadable = false, unreadableAttention = false;
  const unreadableOwners = new Set<string>();
  const rendered = candidates.flatMap(candidate => {
    const answer = answers.get(subjectKey(candidate.subject));
    if (stateFor(candidate, answer) === "stale" && !answer?.item?.read_at) {
      unreadable = true;
      if (candidate.entries.length) unreadableAttention = true;
      if (candidate.inOverview && candidate.values) unreadableOwners.add(candidate.plugin.plugin_id);
    }
    const projection = renderCandidate(candidate, answer, read);
    return projection ? [projection] : [];
  }).sort(compareProjected);
  const readable = rendered.filter(row => row.value);
  current();
  const relations = readable.length > 1 && deadline.active ? ports.relations(readable.map(row => ({ ...row.item.subject, project_id: row.projectId }))) : [];
  const merge = (rows: readonly Projected[]) => {
    const proved = rows.filter(row => row.value);
    const preferred = new Set(proved.filter(row => row.attention).map(row => subjectKey(row.item.subject)));
    const { representatives, used } = mergeRelated(proved.map(row => row.item), relations, preferred);
    return { used, visible: rows.flatMap(row => {
      if (!row.value) return [row];
      const item = representatives.get(subjectKey(row.item.subject));
      return item ? [{ ...row, item }] : [];
    }) };
  };
  const { visible, used } = merge(rendered);
  const excluded: SurfaceGroup["excluded"] = disabled.size ? ports.caller.audience === "user"
    ? [...disabled].map(([owner_plugin_id, count]) => ({ reason: "disabled", owner_plugin_id, count })) : [{ reason: "disabled" }] : undefined;
  const owners = new Set(rendered.map(row => row.item.owner_plugin_id));
  if (request.slot.plugin_id) owners.add(request.slot.plugin_id);
  const declarations = plugins.filter(plugin => owners.has(plugin.plugin_id)).map(plugin => [plugin.scope, plugin.install_id, plugin.revision])
    .sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
  const renderedKeys = new Set(rendered.map(row => subjectKey(row.item.subject)));
  const exposed = readViews(request.slot.kind === "attention" || request.slot.kind === "home"
    ? readers.filter(candidate => renderedKeys.has(subjectKey(candidate.subject))) : readers);
  const facts = { declarations, authority: exposed.sort((a, b) => compareCodeUnits(viewKey(a), viewKey(b))).map(viewRevision),
    values: readable.map(row => [row.item.subject, row.value?.revision, row.attention?.entry]), relations: used };
  return { visible, readable, excluded, unreadable, unreadableAttention, unreadableOwners, unproved, facts,
    forDiscussion(subjects: readonly ActionSubject[]) {
      const bySubject = new Map(readable.map(row => [subjectKey(row.item.subject), row]));
      return merge(subjects.flatMap(subject => {
        const row = bySubject.get(subjectKey(subject));
        return row ? [row] : [];
      }).sort(compareProjected)).visible;
    } };
}
