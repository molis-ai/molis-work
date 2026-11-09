import { createHash } from "node:crypto";
import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { ActionError, findSubjectReader, requireSynchronous, type ActionSubject, type ActionView, type SubjectReaderLookup } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS, type FormKind, type PresentationObject, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceCorrectionInput, SurfaceDescription, SurfaceGroup, SurfaceItem, SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { actionErrorKind, canonicalJsonText, compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { assertSurfaceDescription, isPresentationValuesReader } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { SurfaceCorrectionsSnapshot } from "./corrections.js";
import { surfaceErrors } from "./errors.js";
import { declaredAction, isPlacementOperation, operationsFor, ownsView } from "./operations.js";
import { checkCurrent, subjectKey, viewKey, type SurfaceComposePorts, type SurfaceCorrectPorts, type SurfacePlugin } from "./ports.js";
import { deliveredSubjects, formAt, positionFor, type Position } from "./position.js";
import { mergeRelated } from "./relations.js";
import { readRuleValues, startDeadline } from "./values.js";

interface Candidate {
  subject: ActionSubject;
  plugin: SurfacePlugin;
  reader: SubjectReaderLookup;
  object?: PresentationObject;
  values?: ActionView;
  entries: AttentionSurfaceEntry[];
}

interface Projected {
  item: SurfaceItem;
  value?: PresentationValueItem;
  attention?: { entry: AttentionSurfaceEntry; rank: number };
  pin: number;
  projectId: string | null;
}

function pickCandidates(subjects: readonly ActionSubject[], attention: readonly AttentionSurfaceEntry[], plugins: readonly SurfacePlugin[], views: readonly ActionView[]) {
  const readers = new Map<string, SubjectReaderLookup>();
  const values = views.filter(view => view.availability.available && isPresentationValuesReader(view));
  const bySubject = new Map<string, AttentionSurfaceEntry[]>();
  for (const entry of attention) {
    const key = subjectKey(entry.subject);
    const found = bySubject.get(key);
    if (found) found.push(entry); else bySubject.set(key, [entry]);
  }
  const candidates: Candidate[] = [];
  // Attention records identify their owner plugin, not one of its installations.
  const disabledOwners = new Set(plugins.filter(plugin => plugin.state === "disabled").map(plugin => plugin.plugin_id));
  for (const plugin of plugins) if (plugin.state !== "disabled") disabledOwners.delete(plugin.plugin_id);
  const disabled = new Map<string, number>();
  const countDisabled = (owner: string) => disabled.set(owner, (disabled.get(owner) ?? 0) + 1);
  let unproved = false;
  for (const subject of subjects) {
    const facts = bySubject.get(subjectKey(subject)) ?? [];
    for (const owner of new Set(facts.map(entry => entry.owner_plugin_id))) {
      if (disabledOwners.has(owner)) countDisabled(owner);
    }
    let reader = readers.get(subject.kind);
    if (!reader) { reader = findSubjectReader(views, subject.kind); readers.set(subject.kind, reader); }
    const view = reader.found === "one" || reader.found === "unavailable" ? reader.view : undefined;
    const known = view ? plugins.find(plugin => ownsView(plugin, view)) : undefined;
    const fallback = view || attention.length ? [] : plugins.filter(plugin => views.some(action => ownsView(plugin, action)
      && action.action.search_source?.kinds.some(kind => kind.kind === subject.kind)));
    const plugin = known ?? (fallback.length === 1 ? fallback[0] : undefined);
    const entries = facts.filter(entry => entry.owner_plugin_id === plugin?.plugin_id);
    if (!plugin || (attention.length > 0 && !entries.length)) {
      if (!attention.length) unproved = true;
      continue;
    }
    if (plugin.state !== "running") {
      if (!attention.length) {
        if (plugin.state === "disabled") countDisabled(plugin.plugin_id);
        else unproved = true;
      }
      continue;
    }
    const object = reader.found === "one" ? plugin.presentation?.objects.find(entry => entry.kind === subject.kind) : undefined;
    const ownedValues = object ? values.filter(action => ownsView(plugin, action) && action.action.scope === view?.action.scope
      && action.action.subject_kinds.includes(subject.kind)) : [];
    candidates.push({ subject, plugin, reader, object, values: ownedValues.length === 1 ? ownedValues[0] : undefined, entries });
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

function stateFor(candidate: Candidate, answer: { item?: PresentationValueItem; denied?: true } | undefined): SurfaceItem["state"] {
  if (answer?.item) return answer.item.state;
  if (answer?.denied) return "forbidden";
  const availability = candidate.reader.found === "unavailable" ? candidate.reader.view.availability : undefined;
  return availability && !availability.available && actionErrorKind({ code: availability.code, message: availability.reason }) === "forbidden" ? "forbidden" : "stale";
}

function renderCandidate(candidate: Candidate, answer: { item?: PresentationValueItem; denied?: true } | undefined,
  request: SurfaceRequest, position: Position, delivered: ReadonlySet<string>, corrections: SurfaceCorrectionsSnapshot,
  views: readonly ActionView[], ports: SurfaceComposePorts): Projected | undefined {
  const { subject, plugin, object } = candidate;
  const key = subjectKey(subject);
  const choices = corrections.corrections.filter(choice => choice.subject && subjectKey(choice.subject) === key);
  const value = answer?.item, state = stateFor(candidate, answer);
  const readable = value?.state === "ok" || (value?.state === "stale" && value.read_at !== undefined);
  if (request.slot.kind === "attention" && !readable) return undefined;
  const base: FormKind = request.slot.kind === "conversation" ? delivered.has(key) ? "card" : "chip" : position.forms.at(-1)!;
  const chosenForm = [choices.find(choice => choice.correction === "form")?.form,
    corrections.corrections.find(choice => choice.correction === "form" && !choice.subject)?.form].find(form => form && position.forms.includes(form)) ?? base;
  const display = formAt(position, chosenForm, readable ? object : undefined);
  const status = object?.status ? value?.values?.[object.status.field] : undefined;
  const ruleStatus = typeof status === "string" ? status : undefined;
  const fallbackOpen = !object && candidate.reader.found === "one";
  const operations = readable && object && display.fields.length ? operationsFor(object, plugin, display.form, request.slot, ruleStatus, views, ports.diagnostic)
    : { actions: readable || fallbackOpen ? [{ ref: "open", primary: false }] : [] };
  const attention = candidate.entries.map(entry => ({ entry, rank: attentionRank(entry, object, ruleStatus) })).sort(compareAttention)[0];
  const item: SurfaceItem = { subject, owner_plugin_id: plugin.plugin_id, state, ...display, ...operations,
    ...(state === "stale" && value?.read_at ? { read_at: value.read_at } : {}) };
  return { item, ...(readable ? { value } : {}), attention, pin: choices.find(choice => choice.correction === "pin")?.position ?? PRESENTATION_LIMITS.values_subjects,
    projectId: candidate.values?.action.scope === "home" ? null : ports.caller.project_id };
}

function groupState(projected: readonly Projected[], unreadable: boolean): Pick<SurfaceGroup, "state" | "read_at"> {
  if (unreadable) return { state: "unreadable" };
  if (projected.length && projected.every(row => row.item.state === "stale" && row.item.read_at)) {
    return { state: "stale", read_at: projected.map(row => row.item.read_at!).sort((a, b) => Date.parse(a) - Date.parse(b))[0] };
  }
  return { state: "ok" };
}

const revisionFor = (data: unknown) => createHash("sha256").update(canonicalJsonText(data, "null")).digest("hex");
const CACHE_LIMIT = 64;

export class SurfaceCompositionService {
  readonly #cache = new Map<string, SurfaceDescription>();

  async compose(request: SurfaceRequest, ports: SurfaceComposePorts): Promise<SurfaceDescription> {
    const deadline = startDeadline(ports.signal);
    try {
      checkCurrent(ports);
      const checked = await deadline.wait(ports.beforeEffect().then(() => true));
      checkCurrent(ports);
      if (!checked) throw surfaceErrors.compose_failed("暂时读不到这个位置");
      const plugins = await deadline.wait(Promise.resolve(ports.catalog()));
      checkCurrent(ports);
      if (!plugins) throw surfaceErrors.compose_failed("暂时读不到插件目录");
      const position = positionFor(request.slot, plugins);
      const delivered = deliveredSubjects(request);
      if (!deadline.active) throw surfaceErrors.compose_failed("暂时读不到动作目录");
      const views = await deadline.wait(Promise.resolve(ports.discover()));
      checkCurrent(ports);
      if (!views) throw surfaceErrors.compose_failed("暂时读不到动作目录");
      const corrections = ports.corrections.read(request.slot);
      const result = await composeGroup(request, ports, position, plugins, views, delivered, corrections, deadline);
      checkCurrent(ports);
      const { actor_id, project_id, audience, plugin_install_id, calling_plugin_id } = ports.caller;
      const revision = revisionFor([[actor_id, project_id, audience, plugin_install_id, calling_plugin_id], request.slot, request.expanded,
        request.slot.kind === "attention" ? undefined : request.subjects, [...delivered].sort(), corrections.revision, result]);
      const cached = this.#cache.get(revision);
      if (cached) return structuredClone(cached);
      const candidate: SurfaceDescription = { composed_by: "rules", revision, corrections_revision: corrections.revision, groups: [result.group] };
      return this.checked(candidate);
    } finally { deadline.dispose(); }
  }

  async correct(input: SurfaceCorrectionInput, ports: SurfaceCorrectPorts) {
    requireSynchronous(ports.current());
    const plugins = input.slot.kind === "plugin-slot" ? await ports.catalog() : [];
    requireSynchronous(ports.current());
    const position = positionFor(input.slot, plugins);
    if (!position.forms.length) throw surfaceErrors.mount_not_declared("这个位置没有声明可接受的形态");
    if ((input.form && !position.forms.includes(input.form)) || (input.subject && position.refuse.has(input.subject.kind))) {
      throw new ActionError("actions.input_invalid", "这个位置不接受该形态或对象");
    }
    return ports.corrections.correct(input, ports, () => ports.now());
  }

  private checked(candidate: SurfaceDescription): SurfaceDescription {
    try {
      const { description, dropped } = assertSurfaceDescription(candidate, candidate);
      if (dropped.length) throw surfaceErrors.compose_failed("组合的候选没有通过校验");
      this.#cache.set(candidate.revision, structuredClone(description));
      if (this.#cache.size > CACHE_LIMIT) this.#cache.delete(this.#cache.keys().next().value!);
      return description;
    } catch {
      throw surfaceErrors.compose_failed("组合的候选没有通过校验");
    }
  }
}

function relevantViews(candidates: readonly Candidate[], views: readonly ActionView[]): ActionView[] {
  const keys = new Set(candidates.flatMap(candidate => candidate.reader.found === "one"
    ? [viewKey(candidate.reader.view), ...(candidate.values ? [viewKey(candidate.values)] : [])] : []));
  for (const candidate of candidates) for (const action of candidate.object?.actions ?? []) {
    const view = declaredAction(action.ref, candidate.plugin, views);
    if (view) keys.add(viewKey(view));
  }
  return views.filter(view => keys.has(viewKey(view)) || (candidates.length > 0 && isPlacementOperation(view)));
}

async function composeGroup(request: SurfaceRequest, ports: SurfaceComposePorts, position: Position, plugins: readonly SurfacePlugin[], views: readonly ActionView[],
  delivered: ReadonlySet<string>, corrections: SurfaceCorrectionsSnapshot, deadline: ReturnType<typeof startDeadline>) {
  const isAttention = request.slot.kind === "attention";
  const kind = isAttention ? "attention" : "slot";
  let attention: readonly AttentionSurfaceEntry[] = [];
  let unreadable = false;
  if (isAttention && deadline.active) {
    try { attention = ports.attention(); } catch (error) {
      checkCurrent(ports);
      if (actionErrorKind(error) === "forbidden") throw error;
      unreadable = true;
    }
  }
  const incoming = isAttention ? attention.map(entry => entry.subject) : request.subjects ?? [];
  const removed = new Set(corrections.corrections.flatMap(choice => choice.correction === "remove" && choice.subject ? [subjectKey(choice.subject)] : []));
  const subjects = position.forms.length ? [...new Map(incoming.filter(subject => !position.refuse.has(subject.kind) && !removed.has(subjectKey(subject)))
    .map(subject => [subjectKey(subject), subject])).values()] : [];
  const { candidates, disabled, unproved } = pickCandidates(subjects, attention, plugins, views);
  const relevant = relevantViews(candidates, views);
  const verify = ports.retain(relevant.filter(view => view.availability.available));
  const answers = await readRuleValues(candidates.flatMap(candidate => candidate.values && candidate.object
    ? [{ subject: candidate.subject, action: candidate.values, object: candidate.object }] : []), ports, deadline);
  requireSynchronous(verify());
  const rendered = candidates.flatMap(candidate => {
    const answer = answers.get(subjectKey(candidate.subject));
    if (stateFor(candidate, answer) === "stale" && !answer?.item?.read_at) unreadable = true;
    const projection = renderCandidate(candidate, answer, request, position, delivered, corrections, views, ports);
    return projection ? [projection] : [];
  });
  rendered.sort((left, right) => isAttention ? compareAttention(left.attention!, right.attention!) : left.pin - right.pin);
  const readable = rendered.filter(row => row.value);
  checkCurrent(ports);
  const relations = readable.length > 1 && deadline.active ? ports.relations(readable.map(row => ({ ...row.item.subject, project_id: row.projectId }))) : [];
  const { representatives, used } = mergeRelated(readable.map(row => row.item), relations, isAttention);
  const visible = rendered.flatMap(row => {
    if (!row.value) return [row];
    const item = representatives.get(subjectKey(row.item.subject));
    return item ? [{ ...row, item }] : [];
  });
  const canFold = request.slot.kind === "conversation" || request.slot.kind === "discussion";
  const hidden = visible.slice(position.max);
  const overflow = canFold && !request.expanded ? hidden.filter(row => row.value).length : 0;
  const shown = request.expanded && canFold ? visible.filter((row, index) => index < position.max || row.value) : visible.slice(0, position.max);
  const excluded = disabled.size ? ports.caller.audience === "user"
    ? [...disabled].map(([owner_plugin_id, count]) => ({ reason: "disabled" as const, owner_plugin_id, count })) : [{ reason: "disabled" as const }] : undefined;
  const group: SurfaceGroup = { kind, ...groupState(shown, unreadable || unproved || !deadline.active), items: shown.map(row => row.item),
    ...(overflow ? { overflow: { count: overflow } } : {}), ...(excluded ? { excluded } : {}) };
  const owners = new Set(rendered.map(row => row.item.owner_plugin_id));
  if (request.slot.plugin_id) owners.add(request.slot.plugin_id);
  const declarations = plugins.filter(plugin => owners.has(plugin.plugin_id)).map(plugin => [plugin.scope, plugin.install_id, plugin.revision])
    .sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
  const renderedKeys = new Set(rendered.map(row => subjectKey(row.item.subject)));
  const exposed = isAttention ? relevantViews(candidates.filter(candidate => renderedKeys.has(subjectKey(candidate.subject))), views) : relevant;
  const authority = exposed.sort((a, b) => compareCodeUnits(viewKey(a), viewKey(b)))
    .map(view => [viewKey(view), view.availability.available ? true : view.availability.code]);
  return { group, declarations, authority, values: readable.map(row => [row.item.subject, row.value?.revision, row.attention?.entry.revision]), relations: used };
}
