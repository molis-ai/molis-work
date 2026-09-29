import {
  ActionError, isObjectCopier, isObjectMover, isSubjectReader, PERSONAL_SPACE_PROJECT_ID,
  type ActionCallContext, type ActionClient, type ActionReference, type ActionSubjectContext, type ActionView, type PlacementResult,
  type WorkflowItemRef,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextAccess, ContextEdge, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type {
  PlacedObject, PlacementAssociation, PlacementConvertRequest, PlacementConvertResponse, PlacementCreateRequest, PlacementDescription, PlacementGoalView,
  PlacementLocation, PlacementMoveResponse, PlacementObjectState, PlacementOpen, PlacementRelatedItem, PlacementSpaceView,
} from "@molis-ai/molis-work-contracts/services/placement";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-placement",
  packagePath: "horizontal/placement",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/placement",
  capabilities: ["placement.describe.v1", "placement.links.v1"],
} as const;

/** The person's own client and context over one partition: a project, the personal space, or (null) the Home. */
export interface PlacementScope { client: ActionClient; caller: ActionCallContext }

export interface PlacementPorts {
  /** This service's own partition of a Home-level Context Ledger. */
  ledger: ContextLedgerApi;
  /** The personal space and every project, with the names people read. */
  spaces(): Promise<readonly PlacementSpaceView[]>;
  /** Opens the partition when needed. Throws `placement.project_missing` when the project no longer exists. */
  scope(projectId: string | null): Promise<PlacementScope>;
  /** Last title seen for an object, so a deleted one is still named where it was used. A cache, never a fact. */
  titles: { get(kind: string, id: string): string | null; set(kind: string, id: string, title: string): void };
  /** Text in the reader's language. Strings are Chinese with `{name}` slots; without it the slots are only filled in. */
  text?(zh: string, vars?: Record<string, string | number>): string;
}

const ACCESS: ContextAccess = { actor_id: "module:placement", scope: { kind: "personal", id: "placement" } };
/** Ledger-only marker for Home-level content (Shelf, Jelly, Cognia…): always personal, never moved. */
const HOME = "home";
const TYPES = { location: "placement.location", used: "placement.used_in", derived: "placement.derived_from", copied: "placement.copied_from", goal: "placement.goal_in" } as const;

const identity = (kind: string, id: string): ObjectRef => ({ module: "plugins", object_type: kind, id, version: null, scope: ACCESS.scope, project_id: null });
const projectRef = (projectId: string): ObjectRef => ({ module: "projects", id: projectId, version: null, scope: ACCESS.scope, project_id: null });
const key = (...parts: string[]) => JSON.stringify(parts);
const sameObject = (ref: ObjectRef, kind: string, id: string) => ref.module === "plugins" && ref.object_type === kind && ref.id === id;

interface Read { state: PlacementObjectState; reason: string | null; context: ActionSubjectContext | null; plugin: { plugin_id: string; title: string } | null }

/**
 * Where an object lives and what it is linked to (specs/work-placement §7.2). Object facts are always read back from
 * their owner through the shared directory; this service only owns the relations it records: where a moved object went,
 * which projects use a personal object, and what a copy or conversion came from.
 */
export class PlacementService {
  constructor(private readonly ports: PlacementPorts) {}

  private t(zh: string, vars: Record<string, string | number> = {}): string {
    if (this.ports.text) return this.ports.text(zh, vars);
    return Object.entries(vars).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), zh);
  }

  async spaces(): Promise<PlacementSpaceView[]> { return [...await this.ports.spaces()]; }

  /** Moves are followed: an old reference still finds the object. */
  locate(object: PlacedObject): { object: PlacedObject; moved: boolean } {
    const edge = this.ports.ledger.query.get(ACCESS, key("location", object.kind, object.id));
    if (!edge) return { object, moved: false };
    const partition = edge.target.id === HOME ? null : edge.target.id;
    return { object: { ...object, project_id: partition }, moved: partition !== object.project_id };
  }

  async describe(input: PlacedObject): Promise<PlacementDescription> {
    const spaces = await this.ports.spaces();
    const located = this.locate(input);
    const object = located.object;
    const read = await this.read(object);
    const title = read.context?.title || this.ports.titles.get(object.kind, object.id) || this.t("未命名");
    const location = read.state === "missing" && read.reason === PROJECT_GONE ? null : this.location(object.project_id, spaces);
    const associations: PlacementAssociation[] = [];
    for (const edge of this.edges(TYPES.used).filter(edge => sameObject(edge.source, object.kind, object.id))) {
      const project = spaces.find(space => space.project_id === edge.target.id);
      associations.push({ key: edge.key, type: "used_in", label: project ? this.t("用于 项目「{name}」", { name: project.title }) : this.t("用于 一个已删除的项目"),
        target: { kind: "project", project_id: edge.target.id, title: project?.title ?? this.t("已删除的项目") }, since: edge.recorded_at, removable: true });
    }
    // Goals keep the bindings in their own project: the one it lives in, and every project it was bound in from elsewhere or before a move.
    const boundIn = new Set<string>(object.project_id === null ? [] : [object.project_id]);
    for (const edge of this.edges(TYPES.goal)) if (sameObject(edge.source, object.kind, object.id)) boundIn.add(edge.target.id);
    const bound: { project_id: string; binding_id: string; goal_id: string; created_at: string }[] = [];
    for (const projectId of boundIn) for (const binding of await this.goalBindings(projectId, { kind: object.kind, id: object.id })) bound.push({ ...binding, project_id: projectId });
    for (const binding of bound) {
      const goal = await this.goalTitle(binding.project_id, binding.goal_id);
      const name = goal ?? this.t("（读不到标题）");
      associations.push({ key: key("goal", binding.project_id, binding.goal_id, binding.binding_id), type: "goal",
        label: binding.project_id === object.project_id ? this.t("Goal「{name}」", { name }) : this.t("Goal「{name}」 · {place}", { name, place: this.location(binding.project_id, spaces).title }),
        target: { kind: "goal", project_id: binding.project_id, goal_id: binding.goal_id, title: goal ?? "" }, since: binding.created_at, removable: true });
    }
    for (const goalId of read.context?.goal_ids ?? []) {
      if (object.kind === "goal" && goalId === object.id) continue;
      if (bound.some(binding => binding.goal_id === goalId && binding.project_id === object.project_id)) continue;
      const goal = object.project_id === null ? null : await this.goalTitle(object.project_id, goalId);
      // Kept by the plugin itself (a document's “挂到 Goal”): changed there, not here.
      associations.push({ key: null, type: "goal", label: this.t("Goal「{name}」 · {plugin}里挂接", { name: goal ?? this.t("（读不到标题）"), plugin: read.plugin?.title ?? "" }),
        target: { kind: "goal", project_id: object.project_id, goal_id: goalId, title: goal ?? "" }, since: null, removable: false });
    }
    // A conversion names what the other end is (a Goal, or the plugin that keeps it), so a document and a Goal made from one spark read apart.
    const origin = (label: (title: string, goal: boolean) => string, kind: PlacementAssociation["type"]) => async (edge: ContextEdge, other: ObjectRef) => {
      const found = this.locate({ kind: other.object_type ?? "", id: other.id, project_id: null }).object;
      const otherRead = await this.read(found);
      const otherTitle = otherRead.context?.title || this.ports.titles.get(found.kind, found.id) || this.t("未命名");
      const where = otherRead.state === "missing" ? this.t("原对象已删除") : this.location(found.project_id, spaces).title;
      const what = kind.startsWith("derived") && found.kind !== "goal" ? otherRead.plugin?.title ?? "" : "";
      associations.push({ key: null, type: kind, label: [label(otherTitle, found.kind === "goal"), what, where].filter(Boolean).join(" · "),
        target: { kind: "object", object: found, title: otherTitle, state: otherRead.state, location: otherRead.state === "ok" ? this.location(found.project_id, spaces) : null },
        since: edge.recorded_at, removable: false });
    };
    const derivedFrom = this.ports.ledger.query.get(ACCESS, key("derived_from", object.kind, object.id));
    if (derivedFrom) await origin((title, goal) => this.t(goal ? "来自 Goal《{title}》" : "来自《{title}》", { title }), "derived_from")(derivedFrom, derivedFrom.target);
    for (const edge of this.edges(TYPES.derived).filter(edge => sameObject(edge.target, object.kind, object.id))) {
      await origin((title, goal) => this.t(goal ? "已建成 Goal《{title}》" : "已转成《{title}》", { title }), "derived_into")(edge, edge.source);
    }
    const copiedFrom = this.ports.ledger.query.get(ACCESS, key("copied_from", object.kind, object.id));
    if (copiedFrom) await origin(title => this.t("复制自《{title}》", { title }), "copied_from")(copiedFrom, copiedFrom.target);
    for (const edge of this.edges(TYPES.copied).filter(edge => sameObject(edge.target, object.kind, object.id))) {
      await origin(title => this.t("复制到《{title}》", { title }), "copied_into")(edge, edge.source);
    }
    const tools = read.state === "ok" && object.project_id !== null ? await this.tools(object) : { mover: null, copier: null };
    return {
      state: read.state, reason: read.reason, object, title, plugin: read.plugin, location,
      moved_from: located.moved ? this.location(input.project_id, spaces) : null,
      associations,
      can: { move: !!tools.mover, copy: !!tools.copier, use_in_project: read.state === "ok" && spaces.some(space => space.kind === "project" && space.project_id !== object.project_id) },
      open: read.context?.open ? { project_id: object.project_id, surface: read.context.open.surface, id: read.context.open.id } : null,
    };
  }

  /** Objects from the personal space or other projects used in this project, each with whether it still opens. */
  async related(projectId: string): Promise<PlacementRelatedItem[]> {
    const spaces = await this.ports.spaces();
    const items: PlacementRelatedItem[] = [];
    for (const edge of this.edges(TYPES.used).filter(edge => edge.target.id === projectId)) {
      const object = this.locate({ kind: edge.source.object_type ?? "", id: edge.source.id, project_id: null }).object;
      const read = await this.read(object);
      items.push({ key: edge.key, object, title: read.context?.title || this.ports.titles.get(object.kind, object.id) || this.t("未命名"),
        state: read.state, reason: read.reason, location: read.state === "ok" ? this.location(object.project_id, spaces) : null, plugin: read.plugin,
        since: edge.recorded_at, open: read.context?.open ? { project_id: object.project_id, surface: read.context.open.surface, id: read.context.open.id } : null });
    }
    return items.sort((a, b) => b.since.localeCompare(a.since));
  }

  /** “用于项目”: a relation, not a copy; the object stays where it is and keeps its access. */
  async link(input: PlacedObject, projectId: string): Promise<{ key: string }> {
    const spaces = await this.ports.spaces();
    const target = spaces.find(space => space.project_id === projectId);
    if (!target || target.kind !== "project") throw new ActionError("placement.project_missing", this.t("找不到这个项目"));
    const object = this.locate(input).object;
    if (object.project_id === projectId) throw new ActionError("placement.already_here", this.t("它就放在这个项目里，不需要再关联"));
    const read = await this.read(object);
    if (read.state !== "ok") throw new ActionError(`placement.${read.state}`, read.reason ?? this.t("暂时读不到这个对象"));
    this.remember(object);
    const linkKey = key("used_in", object.kind, object.id, projectId);
    this.ports.ledger.commands.put(ACCESS, { key: linkKey, type: TYPES.used, source: identity(object.kind, object.id), target: projectRef(projectId),
      cause: "placement.link" });
    return { key: linkKey };
  }

  async unlink(linkKey: string): Promise<{ removed: boolean }> {
    let parts: unknown;
    try { parts = JSON.parse(linkKey); } catch { parts = null; }
    if (Array.isArray(parts) && parts[0] === "goal" && parts.length === 4 && parts.every(part => typeof part === "string")) {
      const [, projectId, goalId, bindingId] = parts as string[];
      const scope = await this.ports.scope(projectId!);
      const release = await this.action(scope, "goals.inputs.release");
      if (!release) throw new ActionError("placement.target_unavailable", this.t("这个位置没有启用 Goals"));
      return { removed: (await scope.client.invoke(scope.caller, release, { goal_id: goalId, binding_id: bindingId }) as { released: boolean }).released };
    }
    if (!Array.isArray(parts) || parts[0] !== "used_in") throw new ActionError("placement.not_removable", this.t("这条关系由插件自己管理，请在原处修改"));
    const edge = this.ports.ledger.commands.remove(ACCESS, linkKey, "placement.unlink");
    return { removed: !!edge && edge.state === "removed" };
  }

  /** Goals still open in one location, for choosing one to bind to. */
  async goals(projectId: string): Promise<PlacementGoalView[]> {
    const scope = await this.ports.scope(projectId);
    const list = await this.action(scope, "goals.list");
    if (!list) return [];
    const goals: PlacementGoalView[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await scope.client.invoke(scope.caller, list, { limit: 100, ...(after ? { after_cursor: after } : {}) }) as { goals: { goal_id: string; title: string }[]; next_cursor?: string | null };
      goals.push(...result.goals.map(goal => ({ goal_id: goal.goal_id, title: goal.title })));
      if (!result.next_cursor) break;
      after = result.next_cursor;
    }
    return goals;
  }

  /** Goals records the binding; an object living elsewhere is also used in the Goal's project so the project lists it. */
  async bindGoal(input: PlacedObject, projectId: string, goalId: string): Promise<{ key: string }> {
    const object = this.locate(input).object;
    const read = await this.read(object);
    if (read.state !== "ok") throw new ActionError(`placement.${read.state}`, read.reason ?? this.t("暂时读不到这个对象"));
    const scope = await this.ports.scope(projectId);
    const bind = await this.action(scope, "goals.inputs.bind");
    if (!bind) throw new ActionError("placement.target_unavailable", this.t("这个位置没有启用 Goals，不能关联目标"));
    const result = await scope.client.invoke(scope.caller, bind, { goal_id: goalId, subject: { kind: object.kind, id: object.id }, title: read.context!.title || this.t("未命名") }) as { binding: { binding_id: string } };
    this.remember(object);
    this.ports.ledger.commands.put(ACCESS, { key: key("goal_in", object.kind, object.id, projectId), type: TYPES.goal, source: identity(object.kind, object.id),
      target: projectRef(projectId), cause: "placement.goal" });
    if (object.project_id !== projectId) {
      const spaces = await this.ports.spaces();
      if (spaces.some(space => space.project_id === projectId && space.kind === "project")) {
        this.ports.ledger.commands.put(ACCESS, { key: key("used_in", object.kind, object.id, projectId), type: TYPES.used, source: identity(object.kind, object.id),
          target: projectRef(projectId), cause: "placement.goal" });
      }
    }
    return { key: key("goal", projectId, goalId, result.binding.binding_id) };
  }

  /** Something new made in one place (from a Goal or the placement panel); bound to a Goal when asked. */
  async create(request: PlacementCreateRequest): Promise<PlacementConvertResponse & { goal_key: string | null }> {
    const spaces = await this.ports.spaces();
    if (!spaces.some(space => space.project_id === request.project_id)) throw new ActionError("placement.project_missing", this.t("找不到这个位置"));
    const scope = await this.ports.scope(request.project_id);
    const views = await scope.client.discover(scope.caller);
    const create = views.find(view => view.action.workflow_content?.id === request.station && view.action.workflow_content.role === "create" && view.availability.available);
    if (!create) throw new ActionError("placement.target_unavailable", this.t("这个位置不能新建这类内容"));
    const title = (request.title ?? "").trim() || this.t("未命名");
    const item = await scope.client.invoke(scope.caller, ref(create), { title }) as WorkflowItemRef;
    const readers = views.filter(view => isSubjectReader(view.action) && view.provider.provider_id === create.provider.provider_id);
    const created: PlacedObject = { kind: readers.length === 1 ? readers[0]!.action.subject_kinds[0]! : request.station, id: item.item_id, project_id: request.project_id };
    this.remember(created);
    const goalKey = request.goal_id ? (await this.bindGoal(created, request.project_id, request.goal_id)).key : null;
    const createdRead = await this.read(created);
    return { object: created, title: createdRead.context?.title ?? item.title, location: this.location(created.project_id, spaces), open: await this.openOf(created), goal_key: goalKey };
  }

  private async action(scope: PlacementScope, capabilityId: string): Promise<ActionReference | null> {
    const view = (await scope.client.discover(scope.caller)).find(entry => entry.capability_id === capabilityId && entry.availability.available);
    return view ? ref(view) : null;
  }

  private async goalBindings(projectId: string, subject: { kind: string; id: string }): Promise<{ binding_id: string; goal_id: string; created_at: string }[]> {
    try {
      const scope = await this.ports.scope(projectId);
      const list = await this.action(scope, "goals.inputs.list");
      if (!list) return [];
      return (await scope.client.invoke(scope.caller, list, { subject }) as { bindings: { binding_id: string; goal_id: string; created_at: string }[] }).bindings;
    } catch { return []; }
  }

  async move(input: PlacedObject, to: string): Promise<PlacementMoveResponse> {
    const spaces = await this.ports.spaces();
    const object = this.locate(input).object;
    if (object.project_id === null) throw new ActionError("placement.not_movable", this.t("这类内容只放在个人空间；可以用于项目，但不能移动"));
    if (!spaces.some(space => space.project_id === to)) throw new ActionError("placement.project_missing", this.t("找不到要移到的位置"));
    if (object.project_id === to) throw new ActionError("placement.same_location", this.t("它已经在这个位置"));
    const { mover } = await this.tools(object);
    if (!mover) throw new ActionError("placement.not_movable", this.t("这个插件的内容还不能移动；可以复制或用于项目"));
    const scope = await this.ports.scope(object.project_id);
    const result = await scope.client.invoke(scope.caller, mover, { subject: { kind: object.kind, id: object.id }, to_project_id: to }) as PlacementResult;
    if (result.subject.kind !== object.kind || result.subject.id !== object.id || result.project_id !== to) {
      throw new ActionError("placement.result_mismatch", this.t("插件返回的移动结果与请求不一致，请刷新后核对"));
    }
    this.ports.ledger.commands.put(ACCESS, { key: key("location", object.kind, object.id), type: TYPES.location,
      source: identity(object.kind, object.id), target: projectRef(to), cause: `placement.move:${object.project_id}` });
    // It now lives in that project: “used in” it says nothing more.
    this.ports.ledger.commands.remove(ACCESS, key("used_in", object.kind, object.id, to), "placement.moved_into_project");
    const moved = { ...object, project_id: to };
    return { object: moved, location: this.location(to, spaces), open: await this.openOf(moved) };
  }

  async copy(input: PlacedObject, to: string, requestId: string): Promise<PlacementMoveResponse> {
    const spaces = await this.ports.spaces();
    const object = this.locate(input).object;
    if (object.project_id === null) throw new ActionError("placement.not_copyable", this.t("这类内容只放在个人空间，请在插件里另存"));
    if (!spaces.some(space => space.project_id === to)) throw new ActionError("placement.project_missing", this.t("找不到要复制到的位置"));
    const { copier } = await this.tools(object);
    if (!copier) throw new ActionError("placement.not_copyable", this.t("这个插件的内容还不能复制到别处"));
    const scope = await this.ports.scope(object.project_id);
    const result = await scope.client.invoke(scope.caller, copier, { subject: { kind: object.kind, id: object.id }, to_project_id: to, request_id: requestId }) as PlacementResult;
    if (result.project_id !== to || result.subject.kind !== object.kind) throw new ActionError("placement.result_mismatch", this.t("插件返回的副本与请求不一致，请刷新后核对"));
    const copy = { kind: result.subject.kind, id: result.subject.id, project_id: to };
    this.remember(object);
    this.remember(copy);
    this.ports.ledger.commands.put(ACCESS, { key: key("copied_from", copy.kind, copy.id), type: TYPES.copied,
      source: identity(copy.kind, copy.id), target: identity(object.kind, object.id), cause: "placement.copy" });
    return { object: copy, location: this.location(to, spaces), open: await this.openOf(copy) };
  }

  /** The source hands its content (or what it chooses to hand over) to another plugin; the new object records where it came from. */
  async convert(request: PlacementConvertRequest): Promise<PlacementConvertResponse> {
    const spaces = await this.ports.spaces();
    if (!spaces.some(space => space.project_id === request.to_project_id)) throw new ActionError("placement.project_missing", this.t("找不到要存到的位置"));
    const source = this.locate(request.source).object;
    const read = await this.read(source);
    // A plugin that hands its content over itself (payload) may have no object reader yet; a deleted source never converts.
    if (read.state === "missing" || (read.state !== "ok" && !request.payload)) throw new ActionError(`placement.${read.state}`, read.reason ?? this.t("暂时读不到原对象"));
    const title = (request.payload?.title ?? read.context!.title).trim() || this.t("未命名");
    const body = request.payload?.body ?? read.context!.content;
    const sourceTitle = read.context?.title ?? request.payload!.title;
    if (!read.context) this.ports.titles.set(source.kind, source.id, sourceTitle);
    const from = read.plugin ? `${read.plugin.title} · ${sourceTitle}` : sourceTitle;
    const scope = await this.ports.scope(request.to_project_id);
    const views = await scope.client.discover(scope.caller);
    let created: PlacedObject;
    if ("goal" in request.to) {
      const create = views.find(view => view.capability_id === "goals.create" && view.availability.available);
      if (!create) throw new ActionError("placement.target_unavailable", this.t("这个位置没有启用 Goals，不能建成 Goal"));
      const result = await scope.client.invoke(scope.caller, ref(create), { title: title.slice(0, 200), outcome: body.slice(0, 2000),
        why: this.t("来自 {source}", { source: from }), source_kind: "web", idempotency_key: `placement:${request.request_id}` }) as { goal: { goal_id: string } };
      created = { kind: "goal", id: result.goal.goal_id, project_id: request.to_project_id };
    } else {
      const station = request.to.station;
      const receive = views.find(view => view.action.workflow_content?.id === station && view.action.workflow_content.role === "receive" && view.availability.available);
      if (!receive) throw new ActionError("placement.target_unavailable", this.t("这个位置没有可以接收内容的插件"));
      const item = await scope.client.invoke(scope.caller, ref(receive), { payload: { title, body, source: from },
        context: { instance_id: `placement:${request.request_id}`, step: 0, title } }) as WorkflowItemRef;
      const readers = views.filter(view => isSubjectReader(view.action) && view.provider.provider_id === receive.provider.provider_id);
      const kind = readers.length === 1 ? readers[0]!.action.subject_kinds[0]! : station;
      created = { kind, id: item.item_id, project_id: request.to_project_id };
    }
    this.remember(source);
    this.remember(created);
    this.ports.ledger.commands.put(ACCESS, { key: key("derived_from", created.kind, created.id), type: TYPES.derived,
      source: identity(created.kind, created.id), target: identity(source.kind, source.id), cause: `placement.convert:${"goal" in request.to ? "goal" : request.to.station}` });
    const createdRead = await this.read(created);
    return { object: created, title: createdRead.context?.title ?? title, location: this.location(created.project_id, spaces), open: await this.openOf(created) };
  }

  /** Read one object from its owner in its own partition. Deleted and unreadable stay distinct. */
  private async read(object: PlacedObject): Promise<Read> {
    let scope: PlacementScope;
    try { scope = await this.ports.scope(object.project_id); }
    catch (error) {
      if (error instanceof ActionError && error.code === "placement.project_missing") return { state: "missing", reason: this.t(PROJECT_GONE), context: null, plugin: null };
      return { state: "unavailable", reason: error instanceof Error ? error.message : this.t("暂时打不开它所在的位置"), context: null, plugin: null };
    }
    let views: readonly ActionView[];
    try { views = await scope.client.discover(scope.caller); }
    catch (error) { return { state: "unavailable", reason: error instanceof Error ? error.message : this.t("暂时读不到"), context: null, plugin: null }; }
    const readers = views.filter(view => isSubjectReader(view.action) && view.action.subject_kinds.includes(object.kind));
    const reader = readers.find(view => view.availability.available);
    const plugin = readers[0] ? { plugin_id: readers[0].provider.plugin_id ?? readers[0].provider.provider_id, title: readers[0].provider.title } : null;
    if (!reader) {
      const state = readers[0]?.availability;
      return { state: "unavailable", reason: state && !state.available ? state.reason : this.t("这个插件没有启用，或没有提供对象读取"), context: null, plugin };
    }
    try {
      const context = await scope.client.invoke(scope.caller, ref(reader), { subject_id: object.id }) as ActionSubjectContext;
      if (context.title) this.ports.titles.set(object.kind, object.id, context.title);
      return { state: "ok", reason: null, context, plugin };
    } catch (error) {
      const code = error instanceof ActionError ? error.code : "";
      if (code.endsWith(".not_found")) return { state: "missing", reason: this.t("原对象已删除"), context: null, plugin };
      return { state: "unavailable", reason: error instanceof Error ? error.message : this.t("暂时读不到"), context: null, plugin };
    }
  }

  private async tools(object: PlacedObject): Promise<{ mover: ActionReference | null; copier: ActionReference | null }> {
    try {
      const scope = await this.ports.scope(object.project_id);
      const views = await scope.client.discover(scope.caller);
      const find = (test: (action: ActionView["action"]) => boolean) => {
        const view = views.find(view => test(view.action) && view.action.subject_kinds.includes(object.kind) && view.availability.available);
        return view ? ref(view) : null;
      };
      return { mover: find(isObjectMover), copier: find(isObjectCopier) };
    } catch { return { mover: null, copier: null }; }
  }

  private async openOf(object: PlacedObject): Promise<PlacementOpen | null> {
    const read = await this.read(object);
    return read.context?.open ? { project_id: object.project_id, surface: read.context.open.surface, id: read.context.open.id } : null;
  }

  private async goalTitle(projectId: string, goalId: string): Promise<string | null> {
    const read = await this.read({ kind: "goal", id: goalId, project_id: projectId });
    return read.context?.title ?? null;
  }

  /** Record where an object lives the first time the system relates it, so later moves are followed. */
  private remember(object: PlacedObject): void {
    const locationKey = key("location", object.kind, object.id);
    if (this.ports.ledger.query.get(ACCESS, locationKey)) return;
    this.ports.ledger.commands.put(ACCESS, { key: locationKey, type: TYPES.location, source: identity(object.kind, object.id),
      target: projectRef(object.project_id ?? HOME), cause: "placement.seen" });
  }

  private edges(type: string): ContextEdge[] { return this.ports.ledger.query.list(ACCESS, { type }); }

  private location(projectId: string | null, spaces: readonly PlacementSpaceView[]): PlacementLocation {
    // Home-level plugins answer any project that was granted them, so their content is not “only you”.
    if (projectId === null) return { kind: "personal", project_id: null, title: this.t("个人空间"), access: "home", access_label: this.t("只有你和获授权的助理") };
    if (projectId === PERSONAL_SPACE_PROJECT_ID) return { kind: "personal", project_id: projectId, title: this.t("个人空间"), access: "private", access_label: this.t("只有你") };
    const space = spaces.find(entry => entry.project_id === projectId);
    return { kind: "project", project_id: projectId, title: this.t("项目「{name}」", { name: space?.title ?? this.t("已删除的项目") }), access: "project", access_label: this.t("项目内可见") };
  }
}

const PROJECT_GONE = "所在的项目已删除";
const ref = (view: ActionView): ActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

/** The ledger access this service writes as; the Host authorizes exactly this partition. */
export const PLACEMENT_LEDGER_ACCESS = ACCESS;
