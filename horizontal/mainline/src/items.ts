import { createHash, randomUUID } from "node:crypto";
import { ActionError, isItemPartAction, parseItemPartReference, requireSynchronous, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionExecutionContext,
  type ActionReference, type ActionSubject, type ActionSubjectContext, type ActionView, type SubjectContextRequest, type WorkItemCreateResult, type WorkItemNextResult,
  type WorkItemNextStep, type WorkItemPart, type WorkItemRelatedResult } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OwnedPresentationObject } from "@molis-ai/molis-work-contracts/platform/presentation";
import { MAINLINE_ARRANGE_PERMISSION, WORK_ITEM_KIND, mainlineErrors, type Mainline, type MainlineContentsRequest, type MainlineContentsResult, type MainlineCounts, type MainlineGroupEditRequest,
  type MainlineIssue, type MainlineItemCompleteRequest, type MainlineItemConvertRequest, type MainlineItemCreateRequest, type MainlineItemMoveRequest, type MainlineItemRemoveRequest,
  type MainlineItemRenameRequest, type MainlineItemResult, type MainlineItemSource, type MainlineReadRequest, type MainlineReadResult, type MainlineResult,
  type MainlineSwitchRequest, type WorkItem } from "@molis-ai/molis-work-contracts/services/mainline";
import type { PlacementRelationCandidates, PlacementRelationCreateInput, PlacementRelationResult, PlacementRelationSubjectInput,
  PlacementRelationTargetInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MainlineStore } from "./store.js";

// Work items on the mainline (specs/work-mainline/contract-design.md §2–§5): one person's container of work in one project. What an item
// is made of and what it holds are references; an object's title, state and body are its owner's and are read as the caller each time.
// Whatever waits on another owner (reading or making the source object) is checked again with `beforeEffect` before the store is written.

/** What the Host gives the service for one call: the person's store, and the item sources its trusted catalog declares in this project. */
export interface MainlineItemPorts {
  /** The person's mainline in the caller's project; closed when the call ends. */
  open(caller: ActionCallContext): { store: MainlineStore; close(): void };
  /** The presentation declarations of the installations this project reaches, each with the plugin that owns it (never self-reported). */
  declarations(caller: ActionCallContext): Promise<readonly ItemDeclaration[]>;
}

/** A declaration with its owner: the plugin id people see, and the provider its actions run under in the directory. */
export type ItemDeclaration = OwnedPresentationObject & { readonly provider_id: string };

const referenceOf = (view: ActionView): Required<ActionReference> => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
const asTarget = (itemId: string): ActionSubject => ({ kind: WORK_ITEM_KIND, id: itemId });
const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";

async function withStore<T>(caller: ActionCallContext, ports: MainlineItemPorts, work: (store: MainlineStore) => T | Promise<T>): Promise<T> {
  const handle = ports.open(caller);
  try { return await work(handle.store); } finally { handle.close(); }
}

/** A kind's source as the caller's directory offers it: the declaring owner and each part it can call now. */
interface ItemSource { kind: string; owner: string; provider_id: string; parts: Partial<Record<WorkItemPart, Required<ActionReference>>> }

/**
 * The item sources the caller can use: a kind whose owner declares `item`, with a part only when the owner's own action of that shape
 * is in the caller's directory and available. A declaration names its owner's actions only; one naming another provider's is not a part.
 */
async function itemSources(caller: ActionCallContext, client: ActionClient, ports: MainlineItemPorts, directory?: readonly ActionView[],
  declarations?: readonly ItemDeclaration[]): Promise<ItemSource[]> {
  const declared = (declarations ?? await ports.declarations(caller)).filter(object => object.item);
  if (!declared.length) return [];
  const views = directory ?? await client.discover(caller);
  return declared.map(object => {
    const parts: ItemSource["parts"] = {};
    for (const part of ["create", "related", "next"] as const) {
      const ref = parseItemPartReference(object.item![part]);
      const view = ref && views.find(candidate => candidate.capability_id === ref.capability_id && candidate.version === ref.version
        && candidate.provider.provider_id === object.provider_id && candidate.availability.available);
      if (view && isItemPartAction(view, part, object.kind)) parts[part] = referenceOf(view);
    }
    return { kind: object.kind, owner: object.owner, provider_id: object.provider_id, parts };
  });
}

function sourceOf(sources: readonly ItemSource[], kind: string, part?: WorkItemPart): ItemSource {
  const source = sources.find(candidate => candidate.kind === kind);
  if (!source || (part && !source.parts[part])) throw mainlineErrors.source_unavailable("这种对象不能变成事项，或它的来源此刻不提供这一步");
  return source;
}

/** The object read once as the caller; one the caller cannot read is refused by its kind and never named back. */
async function readable(caller: ActionCallContext, client: ActionClient, subject: ActionSubject, directory?: readonly ActionView[]): Promise<ActionSubjectContext> {
  if (subject.kind === WORK_ITEM_KIND) throw new ActionError("actions.input_invalid", "事项不能装进事项，也不能再设为事项");
  try { return (await resolveActionSubject(client, { ...caller, query_only: true }, subject, directory)).context; }
  catch (error) {
    caller.signal?.throwIfAborted();
    throw mainlineErrors.subject_unreadable("读不到这个对象，不能放进事项", { code: codeOf(error) });
  }
}

/**
 * The source's own request id for a 「建成」: from the caller's request id (else the call's), the person, the project, the kind and what is
 * made (a name, or the item it converts). A request retried after a cancel or a conflict makes the same object; two different things
 * asked in one operation make two; nobody else's request reproduces this person's object.
 */
const sourceRequestId = (caller: ActionCallContext, requestId: string | undefined, kind: string, what: readonly string[]) => `mainline:${createHash("sha256")
  .update(JSON.stringify([caller.actor_id, caller.project_id ?? null, requestId ?? caller.call_id ?? randomUUID(), kind, ...what])).digest("hex").slice(0, 40)}`;

async function makeSource(caller: ActionExecutionContext, client: ActionClient, source: ItemSource, name: string, requestId: string): Promise<ActionSubject> {
  const result = await client.invoke(caller, source.parts.create!, { name, request_id: requestId }) as WorkItemCreateResult;
  if (result?.subject?.kind !== source.kind || typeof result.subject.id !== "string") throw mainlineErrors.owner_answer_invalid("来源插件给出的对象读不了，请稍后重试");
  return result.subject;
}

// ---- reading -----------------------------------------------------------------------------------------------------------------------

/** `mainline.read@1`: one store read; the sources from one discovery; with `counts`, one task table read for every item and group. */
export async function readMainline(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, request: MainlineReadRequest,
  taskTable?: (directory: readonly ActionView[]) => Promise<{ tasks: Array<{ subject: ActionSubject; serves: ActionSubject[]; waiting: boolean; running: boolean }> }>): Promise<MainlineReadResult> {
  const directory = await client.discover(caller);
  const [mainline, sources, held] = await withStore(caller, ports, async store => {
    const read = store.read();
    const holds = request.counts ? new Map(read.items.map(item => [item.item_id, store.held(item.item_id)])) : new Map<string, ActionSubject[]>();
    return [read, await itemSources(caller, client, ports, directory), holds] as const;
  });
  const listed: MainlineItemSource[] = sources.map(source => ({ kind: source.kind, owner: source.owner, create: !!source.parts.create, next: !!source.parts.next }));
  if (!request.counts || !taskTable) return { mainline, sources: listed };
  return { mainline, sources: listed, counts: countsOf(mainline, held, (await taskTable(directory)).tasks) };
}

/** Each task once per item: one the item holds, or one that serves the item's source or something it holds. */
function countsOf(mainline: Mainline, held: ReadonlyMap<string, ActionSubject[]>, tasks: Array<{ subject: ActionSubject; serves: ActionSubject[]; waiting: boolean; running: boolean }>): MainlineCounts {
  const counts: MainlineCounts = { items: {}, groups: {} };
  for (const item of mainline.items) {
    const inside = new Set([...(held.get(item.item_id) ?? []), ...(item.source ? [item.source] : [])].map(subjectKey));
    const mine = tasks.filter(task => inside.has(subjectKey(task.subject)) || task.serves.some(served => inside.has(subjectKey(served))));
    counts.items[item.item_id] = { waiting: mine.filter(task => task.waiting).length, running: mine.filter(task => task.running).length };
  }
  for (const group of mainline.groups) {
    counts.groups[group.group_id] = group.items.reduce((sum, entry) => ({ waiting: sum.waiting + (counts.items[entry.item_id]?.waiting ?? 0),
      running: sum.running + (counts.items[entry.item_id]?.running ?? 0) }), { waiting: 0, running: 0 });
  }
  return counts;
}

/** `mainline.subject.read@1`: a light item by its name, one an object became by that object's title as the caller reads it. */
export async function readItemSubject(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, request: SubjectContextRequest): Promise<ActionSubjectContext> {
  const item = await withStore(caller, ports, store => store.item(request.subject_id));
  if (!item) throw mainlineErrors.item_missing("主线上没有这件事项");
  const title = item.name ?? (await readable(caller, client, item.source!)).title;
  return { subject: asTarget(item.item_id), revision: item.created_at, title, content: "", truncated: false };
}

/** `mainline.items.contents@1`: what was put in, and the source's own relation asked once as the caller. */
export async function readContents(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, request: MainlineContentsRequest): Promise<MainlineContentsResult> {
  const [item, held] = await withStore(caller, ports, store => [store.item(request.item_id), store.item(request.item_id) ? store.held(request.item_id) : []] as const);
  if (!item) throw mainlineErrors.item_missing("主线上没有这件事项");
  const related: MainlineContentsResult["related"] = [], issues: MainlineIssue[] = [];
  const part = item.source ? (await itemSources(caller, client, ports)).find(source => source.kind === item.source!.kind)?.parts.related : undefined;
  if (part) {
    try { related.push({ source: part, subjects: ((await client.invoke({ ...caller, query_only: true }, part, { subject: item.source }) as WorkItemRelatedResult).subjects) }); }
    catch (error) { caller.signal?.throwIfAborted(); issues.push({ source: part, title: part.capability_id, code: codeOf(error) }); }
  }
  return { held, related, issues };
}

// ---- writing -----------------------------------------------------------------------------------------------------------------------

/** `mainline.items.create@1`: a light item, an object made into one, or one the source makes for it; each at the end of its group. */
export async function createItem(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, request: MainlineItemCreateRequest): Promise<MainlineItemResult> {
  const given = [request.name, request.from, request.create_as].filter(value => value !== undefined).length;
  if (given !== 1) throw new ActionError("actions.input_invalid", "新建事项要且只要给出名字、一个对象，或在来源里新建的种类与名字之一");
  let source: ActionSubject | undefined;
  if (request.from) {
    // One discovery serves both: whether its kind is an item source, and reading the object as the caller.
    const directory = await client.discover(caller);
    sourceOf(await itemSources(caller, client, ports, directory), request.from.kind);
    source = (await readable(caller, client, request.from, directory)).subject;
  } else if (request.create_as) {
    const { kind, name } = request.create_as;
    source = await makeSource(caller, client, sourceOf(await itemSources(caller, client, ports), kind, "create"), name, sourceRequestId(caller, request.request_id, kind, ["name", name]));
  }
  await caller.beforeEffect();
  return withStore(caller, ports, store => {
    const item = source ? store.createFromSource(source, request.group_id).item : store.createLight(request.name!, request.group_id);
    return { mainline: store.read(), item };
  });
}

/** `mainline.items.convert@1`: the source makes an object under the light item's name; the item keeps what it holds. */
export async function convertItem(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, request: MainlineItemConvertRequest): Promise<MainlineItemResult> {
  const item = await withStore(caller, ports, store => store.item(request.item_id));
  if (!item) throw mainlineErrors.item_missing("主线上没有这件事项");
  if (!item.name) throw new ActionError("actions.input_invalid", "这件事项已经由对象变成，不能再变");
  const subject = await makeSource(caller, client, sourceOf(await itemSources(caller, client, ports), request.kind, "create"), item.name,
    sourceRequestId(caller, request.request_id, request.kind, ["item", item.item_id]));
  await caller.beforeEffect();
  return withStore(caller, ports, store => { const converted = store.convert(request.expected_revision, request.item_id, subject); return { mainline: store.read(), item: converted }; });
}

const arranged = (caller: ActionExecutionContext, ports: MainlineItemPorts, change: (store: MainlineStore) => void): Promise<MainlineResult> =>
  caller.beforeEffect().then(() => withStore(caller, ports, store => { change(store); return { mainline: store.read() }; }));

export const renameItem = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineItemRenameRequest) =>
  arranged(caller, ports, store => store.rename(request.expected_revision, request.item_id, request.name));
export const moveItem = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineItemMoveRequest) =>
  arranged(caller, ports, store => store.move(request.expected_revision, request.item_id, request.group_id, request.index, request.pinned));
export const completeItem = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineItemCompleteRequest) =>
  arranged(caller, ports, store => store.complete(request.expected_revision, request.item_id, request.completed));
export const removeItem = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineItemRemoveRequest) =>
  arranged(caller, ports, store => store.remove(request.expected_revision, request.item_id));
export const editGroups = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineGroupEditRequest) =>
  arranged(caller, ports, store => {
    if (request.op !== "add" && !("group_id" in request && request.group_id)) throw new ActionError("actions.input_invalid", "要说明是哪一组");
    if ((request.op === "add" || request.op === "rename") && !("name" in request && request.name)) throw new ActionError("actions.input_invalid", "要给出组名");
    if (request.op === "move" && !("index" in request && Number.isInteger(request.index))) throw new ActionError("actions.input_invalid", "要给出移到的位置");
    store.editGroups(request);
  });
export const switchItem = (caller: ActionExecutionContext, ports: MainlineItemPorts, request: MainlineSwitchRequest) =>
  arranged(caller, ports, store => store.switchTo(request.item_id));

// ---- the `holds` relation ----------------------------------------------------------------------------------------------------------

const targetsOf = (store: MainlineStore, subject: ActionSubject): PlacementRelationResult => ({ targets: store.holding(subject).map(asTarget) });
function itemTarget(target: ActionSubject): string {
  if (target.kind !== WORK_ITEM_KIND) throw new ActionError("actions.input_invalid", "只能放进事项");
  return target.id;
}

export const holdsList = (caller: ActionExecutionContext, ports: MainlineItemPorts, input: PlacementRelationSubjectInput) =>
  withStore(caller, ports, store => targetsOf(store, input.subject));

export async function holdsBind(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, input: PlacementRelationTargetInput): Promise<PlacementRelationResult> {
  const itemId = itemTarget(input.target), subject = (await readable(caller, client, input.subject)).subject;
  await caller.beforeEffect();
  return withStore(caller, ports, store => { store.hold(itemId, subject); return targetsOf(store, subject); });
}

export async function holdsRelease(caller: ActionExecutionContext, ports: MainlineItemPorts, input: PlacementRelationTargetInput): Promise<PlacementRelationResult> {
  const itemId = itemTarget(input.target);
  await caller.beforeEffect();
  return withStore(caller, ports, store => { store.release(itemId, input.subject); return targetsOf(store, input.subject); });
}

/** The open items in the order of the mainline, the current one first. */
export const holdsCandidates = (caller: ActionExecutionContext, ports: MainlineItemPorts, _input: PlacementRelationSubjectInput): Promise<PlacementRelationCandidates> =>
  withStore(caller, ports, store => {
    const mainline = store.read(), open = mainline.groups.flatMap(group => group.items.map(entry => entry.item_id));
    const ordered = mainline.current ? [mainline.current, ...open.filter(id => id !== mainline.current)] : open;
    return { targets: ordered.map(id => ({ subject: asTarget(id), current: id === mainline.current })) };
  });

export async function holdsCreate(caller: ActionExecutionContext, client: ActionClient, ports: MainlineItemPorts, input: PlacementRelationCreateInput): Promise<PlacementRelationResult> {
  const subject = (await readable(caller, client, input.subject)).subject;
  await caller.beforeEffect();
  return withStore(caller, ports, store => { const item = store.createLight(input.name); store.hold(item.item_id, subject); return targetsOf(store, subject); });
}

/**
 * Into one item, which takes the object out of every other, or into none (`mainline.place`'s `item`). `visible` first says the caller
 * sees the object (a task: on the caller's own task table); nothing about it changes but what holds it.
 */
export async function placeInItem(caller: ActionExecutionContext, ports: MainlineItemPorts, subject: ActionSubject,
  item: { kind: "item" | "none"; item_id?: string }, visible: () => Promise<boolean>): Promise<ActionSubject[]> {
  if (!await visible()) throw mainlineErrors.subject_unreadable("读不到这个任务，不能放进事项");
  const required = [MAINLINE_ARRANGE_PERMISSION];
  await caller.validate_permissions?.(required);
  await caller.beforeEffect();
  requireSynchronous(caller.assert_authority_current?.(undefined, required));
  return withStore(caller, ports, store => store.placeOnly(item.item_id ?? null, subject));
}

// ---- one item's line -----------------------------------------------------------------------------------------------------------------

/** What a line read for one item keeps: its source, what it holds and the source's own relation; and the next step its source gives. */
export interface ItemLineScope {
  item: WorkItem;
  /** The declarations read once for this line, for the item's source and for what it holds. */
  declarations: readonly ItemDeclaration[];
  subjects: ReadonlySet<string>;
  held: readonly ActionSubject[];
  next?: { source: Required<ActionReference>; step: WorkItemNextStep };
  issues: MainlineIssue[];
}

export async function itemLineScope(caller: ActionCallContext, client: ActionClient, ports: MainlineItemPorts, itemId: string, directory: readonly ActionView[]): Promise<ItemLineScope> {
  const [item, held] = await withStore(caller, ports, store => [store.item(itemId), store.item(itemId) ? store.held(itemId) : []] as const);
  if (!item) throw mainlineErrors.item_missing("主线上没有这件事项");
  const subjects = new Set([...held, ...(item.source ? [item.source] : [])].map(subjectKey)), issues: MainlineIssue[] = [];
  const declarations = await ports.declarations(caller);
  const source = item.source ? (await itemSources(caller, client, ports, directory, declarations)).find(candidate => candidate.kind === item.source!.kind) : undefined;
  const reader: ActionCallContext = { ...caller, query_only: true };
  let next: ItemLineScope["next"];
  if (source?.parts.related) {
    try { for (const subject of (await client.invoke(reader, source.parts.related, { subject: item.source }) as WorkItemRelatedResult).subjects) subjects.add(subjectKey(subject)); }
    catch (error) { caller.signal?.throwIfAborted(); issues.push({ source: source.parts.related, title: source.parts.related.capability_id, code: codeOf(error) }); }
  }
  if (source?.parts.next) {
    try {
      const answer = (await client.invoke(reader, source.parts.next, { subjects: [item.source] }) as WorkItemNextResult).items.find(entry => subjectKey(entry.subject) === subjectKey(item.source!));
      // A start that names another provider's action is not the source's own: it is left out, never run.
      if (answer?.next && answer.next.start && answer.next.start.action.provider_id !== source.provider_id) throw mainlineErrors.owner_answer_invalid("下一步只能开始来源自己的动作");
      if (answer?.next) next = { source: source.parts.next, step: answer.next };
    } catch (error) { caller.signal?.throwIfAborted(); issues.push({ source: source.parts.next, title: source.parts.next.capability_id, code: codeOf(error) }); }
  }
  return { item, declarations, subjects, held, ...(next ? { next } : {}), issues };
}
