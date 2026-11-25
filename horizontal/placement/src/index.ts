import {
  ActionError, defineErrorCodes, isObjectCopier, isObjectExporter, isObjectMover, isObjectPutter, isObjectRemover, isPlacementRelationPart, PERSONAL_SPACE_PROJECT_ID, PLACEMENT_RELATION_LIMITS,
  type ActionCallContext, type ActionClient, type ActionReference, type ActionSubject, type ActionView, type PlacementRelationCandidates, type PlacementRelationResult,
  type PlacementExport, type PlacementRelationRole, type PlacementRemoved, type PlacementResult,
  type WorkflowItemRef,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTEXT_RELATION_TYPES, type ContextAccess, type ContextEdge, type ContextLedgerApi, type ContextLedgerRelationReader, type ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import type {
  PlacedObject, PlacementAssociation, PlacedObject as AttachedObject, PlacementAttachKindView, PlacementConvertRequest, PlacementConvertResponse, PlacementCreateRequest, PlacementDescription,
  PlacementLocation, PlacementMoveResponse, PlacementOpen, PlacementRelatedItem, PlacementSpaceView,
} from "@molis-ai/molis-work-contracts/services/placement";

import { createHash } from "node:crypto";
import { readPlacementIn, type PlacementRead } from "./subject-reader.js";
export {previewProjectCopy,type ProjectCopyPreviewInput,type ProjectCopySource,type ProjectCopyPreview,type ProjectCopyPreviewView,type ProjectCopyPreviewEntry,type ProjectCopyBlocker} from './project-copy-preview.js';
export {projectCopyIdentities,type ProjectCopyIdentityInput} from './project-copy-identity.js';
export {createProjectCopyJournal,type ProjectCopyJournal,type ProjectCopyPlan,type ProjectCopyReceipt} from './project-copy-journal.js';
export {executeProjectCopy,type ProjectCopyExecution} from './project-copy-execution.js';

/** The person's own client and context over one partition: a project, the personal space, or (null) the Home. */
export interface PlacementScope { client: ActionClient; caller: ActionCallContext }

export interface PlacementPorts {
  /** This service's own partition of a Home-level Context Ledger. */
  ledger: ContextLedgerApi;
  /** The personal space and every project, with the names people read. */
  spaces(): Promise<readonly PlacementSpaceView[]>;
  /** Opens the partition when needed. Throws `placement.project_missing` when the project no longer exists. */
  scope(projectId: string | null): Promise<PlacementScope>;
  /**
   * Opens a partition to undo a move the plugin already committed. The call being refused does not get another vote:
   * its lease already failed, and checking it again would leave the object where that call put it.
   */
  revert?(projectId: string | null): Promise<PlacementScope>;
  /** Original dispatcher control, bound per invocation; never stored as placement data. */
  beforeEffect?(): void | Promise<void>;
  /** Last title seen for an object, so a deleted one is still named where it was used. A cache, never a fact. */
  titles: { get(kind: string, id: string): string | null; set(kind: string, id: string, title: string): void };
  /** The presentation path follows only its original source partition and never records incidental reads. */
  surfaceSource?: PlacedObject;
  /** Reads a Workbench key in the caller's language. */
  text?(key: string, vars?: Record<string, string | number>): string;
}

const ACCESS: ContextAccess = { actor_id: "module:placement", scope: { kind: "personal", id: "placement" } };
/** Ledger-only marker for Home-level content (Shelf, Jelly, Cognia…): always personal, never moved. */
const HOME = "home";
const TYPES = { location: "placement.location", used: "placement.used_in", derived: CONTEXT_RELATION_TYPES.derived_from, copied: CONTEXT_RELATION_TYPES.copied_from, attached: "placement.attached_in",
  belonging: "placement.belonged_to", belongs: "placement.belongs_to", carrying: "placement.carrying" } as const;

const identity = (kind: string, id: string): ObjectRef => ({ module: "plugins", object_type: kind, id, version: null, scope: ACCESS.scope, project_id: null });
const projectRef = (projectId: string): ObjectRef => ({ module: "projects", id: projectId, version: null, scope: ACCESS.scope, project_id: null });
const key = (...parts: string[]) => JSON.stringify(parts);
const sameObject = (ref: ObjectRef, kind: string, id: string) => ref.module === "plugins" && ref.object_type === kind && ref.id === id;
/** Placement's own record that it attached an object in a project, onto one plugin's kind (D2: the target's plugin and kind are on the edge). */
const attachedInKey = (pluginId: string, targetKind: string, object: AttachedObject, projectId: string) => key("attached_in", pluginId, targetKind, object.kind, object.id, projectId);
/** One relation of an object to a target, as the person removes it: the target's owner releases it. */
const attachedKey = (projectId: string, target: ActionSubject, object: ActionSubject) => key("attached", projectId, target.kind, target.id, object.kind, object.id);

type Read = PlacementRead;

/**
 * Where an object lives and what it is linked to (specs/archive/work-placement §7.2). Object facts are always read back from
 * their owner through the shared directory; this service only owns the relations it records: where a moved object went,
 * which projects use a personal object, and what a copy or conversion came from.
 */
export class PlacementService {
  constructor(private readonly ports: PlacementPorts) {}

  async spaces(): Promise<PlacementSpaceView[]> { return [...await this.ports.spaces()]; }

  /** Moves are followed: an old reference still finds the object. */
  locate(object: PlacedObject): { object: PlacedObject; moved: boolean } {
    const edge = this.ports.ledger.query.get(ACCESS, key("location", object.kind, object.id));
    if (!edge) return { object, moved: false };
    const partition = edge.target.id === HOME ? null : edge.target.id;
    const source = this.ports.surfaceSource;
    if (source && object.kind === source.kind && object.id === source.id && partition !== source.project_id)
      throw new ActionError("actions.provider_changed", "原对象的放置位置已变化");
    return { object: { ...object, project_id: partition }, moved: partition !== object.project_id };
  }

  describe(input: PlacedObject): Promise<PlacementDescription> { return describePlacement(this.ports, this.access(), input); }

  /** Objects from the personal space or other projects used in this project, each with whether it still opens. */
  async related(projectId: string): Promise<PlacementRelatedItem[]> {
    const spaces = await this.ports.spaces();
    const items: PlacementRelatedItem[] = [];
    for (const edge of this.edges(TYPES.used).filter(edge => edge.target.id === projectId)) {
      const object = this.locate({ kind: edge.source.object_type ?? "", id: edge.source.id, project_id: null }).object;
      const read = await this.read(object);
      items.push({ key: edge.key, object, title: read.context?.title || this.ports.titles.get(object.kind, object.id) || placementText(this.ports, "workbench.index.untitled"),
        state: read.state, reason: read.reason, location: read.state === "ok" ? placementLocation(this.ports, object.project_id, spaces) : null, plugin: read.plugin,
        since: edge.recorded_at, open: read.context?.open ? { project_id: placementOpenProject(object, read), surface: read.context.open.surface, id: read.context.open.id } : null });
    }
    return items.sort((a, b) => b.since.localeCompare(a.since));
  }

  /** “用于项目”: a relation, not a copy; the object stays where it is and keeps its access. */
  async link(input: PlacedObject, projectId: string): Promise<{ key: string }> {
    const spaces = await this.ports.spaces();
    const target = spaces.find(space => space.project_id === projectId);
    if (!target || target.kind !== "project") throw new ActionError("placement.project_missing", placementText(this.ports, "workbench.index.project-not-found"));
    const object = this.locate(input).object;
    if (object.project_id === projectId) throw new ActionError("placement.already_here", placementText(this.ports, "workbench.index.s-already-stored-project-no-link-needed"));
    const read = await this.read(object);
    if (read.state !== "ok") throw new ActionError(`placement.${read.state}`, read.reason ?? placementText(this.ports, "workbench.index.can-t-read-item-right-now"));
    if (placementBelongsOf(read) === projectId) throw new ActionError("placement.already_here", placementText(this.ports, "workbench.index.s-already-stored-project-no-link-needed"));
    await this.ports.beforeEffect?.();
    const linkKey = key("used_in", object.kind, object.id, projectId);
    if (this.ports.surfaceSource && this.ports.ledger.query.get(ACCESS, linkKey)?.state === "active")
      throw new ActionError("actions.provider_changed", "这个对象已用于所选项目");
    this.remember(object);
    this.ports.ledger.commands.put(ACCESS, { key: linkKey, type: TYPES.used, source: identity(object.kind, object.id), target: projectRef(projectId),
      cause: "placement.link" });
    return { key: linkKey };
  }

  async unlink(linkKey: string): Promise<{ removed: boolean }> {
    let parts: unknown;
    try { parts = JSON.parse(linkKey); } catch { parts = null; }
    if (Array.isArray(parts) && parts[0] === "attached" && parts.length === 6 && parts.every(part => typeof part === "string")) {
      const [, projectId, targetKind, targetId, kind, id] = parts as string[];
      const scope = await this.ports.scope(projectId!);
      const release = (await attachRelationsOf(this.ports, scope)).of(targetKind!)?.release;
      if (!release) throw new ActionError("placement.target_unavailable", placementText(this.ports, "workbench.index.attach-owner-unavailable"));
      const subject = { kind: kind!, id: id! }, target = { kind: targetKind!, id: targetId! };
      const after = await scope.client.invoke(scope.caller, release, { subject, target }) as PlacementRelationResult;
      return { removed: !after.targets.some(one => one.kind === target.kind && one.id === target.id) };
    }
    if (!Array.isArray(parts) || parts[0] !== "used_in") throw new ActionError("placement.not_removable", placementText(this.ports, "workbench.index.link-managed-plugin-change-there"));
    await this.ports.beforeEffect?.();
    const edge = this.ports.ledger.commands.remove(ACCESS, linkKey, "placement.unlink");
    return { removed: !!edge && edge.state === "removed" };
  }

  /** What can be attached to in one location (Goals still open, any plugin's targets), by kind, for choosing one. */
  attachTargets(projectId: string, input: PlacedObject): Promise<PlacementAttachKindView[]> {
    return placementAttachTargets(this.ports, this.access(), projectId, this.locate(input).object);
  }

  /**
   * 「挂到…」: the target's owner records the binding; an object living elsewhere is also used in the target's project so the project
   * lists it. Placement remembers in which project, and onto which plugin's kind, it attached the object (`placement.attached_in`).
   */
  async attach(input: PlacedObject, projectId: string, target: { kind: string; id: string }, readRevision?: string,
    options?: { mode?: "live" | "fixed"; material_ref?: MaterialRef }): Promise<{ key: string }> {
    const object = this.locate(input).object;
    const read = await this.read(object);
    if (read.state !== "ok") throw new ActionError(`placement.${read.state}`, read.reason ?? placementText(this.ports, "workbench.index.can-t-read-item-right-now"));
    const scope = await this.ports.scope(projectId);
    const relation = (await attachRelationsOf(this.ports, scope)).of(target.kind);
    if (!relation?.bind) throw new ActionError("placement.target_unavailable", placementText(this.ports, "workbench.index.attach-target-unavailable"));
    // What the person saw when they took it goes with it: the owner may keep its revision so it can say later whether the original changed.
    const title = (read.context!.title || placementText(this.ports, "workbench.index.untitled")).slice(0, PLACEMENT_RELATION_LIMITS.title);
    const subject = { kind: object.kind, id: object.id };
    const after = await scope.client.invoke(scope.caller, relation.bind, { subject, target: { kind: target.kind, id: target.id },
      read: { title, ...(readRevision ? { revision: readRevision.slice(0, PLACEMENT_RELATION_LIMITS.revision) } : {}) },
      ...(options?.mode ? { mode: options.mode } : {}), ...(options?.material_ref ? { material_ref: options.material_ref } : {}) }) as PlacementRelationResult;
    if (!after.targets.some(one => one.kind === target.kind && one.id === target.id)) throw new ActionError("placement.result_mismatch", placementText(this.ports, "workbench.index.plugin-returned-copy-that-doesn-t-match-request"));
    // A fixed version (an artifact version or captured snapshot) stands on its own; only a live-followed attachment records `placement.attached_in`.
    if (options?.mode !== "fixed" && object.kind !== "artifact") {
      await this.ports.beforeEffect?.();
      this.remember(object);
      this.ports.ledger.commands.put(ACCESS, { key: attachedInKey(relation.plugin_id, target.kind, object, projectId), type: TYPES.attached,
        source: identity(object.kind, object.id), target: projectRef(projectId), cause: "placement.attach" });
      if (object.project_id !== projectId) {
        const spaces = await this.ports.spaces();
        if (spaces.some(space => space.project_id === projectId && space.kind === "project")) {
          await this.ports.beforeEffect?.();
          this.ports.ledger.commands.put(ACCESS, { key: key("used_in", object.kind, object.id, projectId), type: TYPES.used, source: identity(object.kind, object.id),
            target: projectRef(projectId), cause: "placement.attach" });
        }
      }
    }
    return { key: attachedKey(projectId, target, subject) };
  }

  /** Something new made in one place (from a target's page or the placement panel); attached to that target when asked. */
  async create(request: PlacementCreateRequest): Promise<PlacementConvertResponse & { attached_key: string | null }> {
    const spaces = await this.ports.spaces();
    if (!spaces.some(space => space.project_id === request.project_id)) throw new ActionError("placement.project_missing", placementText(this.ports, "workbench.index.location-not-found"));
    const scope = await this.ports.scope(request.project_id);
    const views = await scope.client.discover(scope.caller);
    const create = views.find(view => view.action.workflow_content?.id === request.station && view.action.workflow_content.role === "create" && view.availability.available);
    if (!create) throw new ActionError("placement.target_unavailable", placementText(this.ports, "workbench.index.kind-item-can-t-be-created-here"));
    const title = (request.title ?? "").trim() || placementText(this.ports, "workbench.index.untitled");
    const item = await scope.client.invoke(scope.caller, ref(create), { title }) as WorkflowItemRef;
    if (!create.action.subject_kinds.includes(item.subject.kind)) throw new ActionError("placement.result_mismatch", placementText(this.ports, "workbench.index.plugin-returned-copy-that-doesn-t-match-request"));
    const created: PlacedObject = { kind: item.subject.kind, id: item.subject.id, project_id: request.project_id };
    await this.ports.beforeEffect?.();
    this.remember(created);
    const attachedKey = request.attach_to ? (await this.attach(created, request.project_id, request.attach_to)).key : null;
    const createdRead = await this.read(created);
    return { object: created, title: createdRead.context?.title ?? item.title, location: placementLocation(this.ports, created.project_id, spaces), open: await this.openOf(created), attached_key: attachedKey };
  }

  async move(input: PlacedObject, to: string): Promise<PlacementMoveResponse> {
    const spaces = await this.ports.spaces();
    // A carry an earlier move of this object left half done (cut between its put and its remove) is finished or taken back first.
    const pending = this.ports.ledger.query.get(ACCESS, carryingKey(input.kind, input.id));
    if (pending && await settleCarry(this.ports, pending) !== "settled") throw carryUnsettled(this.ports);
    const object = this.locate(input).object;
    if (object.project_id === null) return this.moveHome(object, to, spaces);
    if (!spaces.some(space => space.project_id === to)) throw new ActionError("placement.project_missing", placementText(this.ports, "workbench.index.couldn-t-find-where-move"));
    if (object.project_id === to) throw new ActionError("placement.same_location", placementText(this.ports, "workbench.index.s-already-here"));
    const from = object.project_id;
    const carried = await carryTools(this.ports, object, from, to);
    if (carried) {
      await carryMove(this.ports, object, from, to, carried, text => placementText(this.ports, text));
      await settleMove(this.ports, () => writeProjectLocation(this.ports, object, from, to),
        async () => { const back = await carryTools(this.ports, object, to, from, true); if (!back) throw notMovable(this.ports); await carryMove(this.ports, object, to, from, back, text => placementText(this.ports, text), true); });
      this.ports.ledger.commands.remove(ACCESS, carryingKey(object.kind, object.id), "placement.carried");
      const moved = { ...object, project_id: to };
      return { object: moved, location: placementLocation(this.ports, to, spaces), open: await this.openOf(moved) };
    }
    const { mover } = await placementTools(this.ports, object, "move");
    if (!mover) throw new ActionError("placement.not_movable", placementText(this.ports, "workbench.index.items-plugin-can-t-be-moved-yet-copy"));
    const scope = await this.ports.scope(object.project_id);
    const result = await scope.client.invoke(scope.caller, mover, { subject: { kind: object.kind, id: object.id }, to_project_id: to }) as PlacementResult;
    if (result.subject.kind !== object.kind || result.subject.id !== object.id || result.project_id !== to) {
      throw new ActionError("placement.result_mismatch", placementText(this.ports, "workbench.index.plugin-s-move-result-doesn-t-match-request"));
    }
    await settleMove(this.ports, () => writeProjectLocation(this.ports, object, from, to), () => moveBack(this.ports, object, to, from, text => placementText(this.ports, text)));
    const moved = { ...object, project_id: to };
    return { object: moved, location: placementLocation(this.ports, to, spaces), open: await this.openOf(moved) };
  }

  /**
   * Finishes the carries a cut left half done (the Host stopped between a put and its remove): an object found in both partitions goes from
   * where it was while it is still the revision carried, or, changed there since, the put is taken back while that is unchanged. One changed in
   * both is left in both, and its record stays, so nothing either side wrote is lost. Returns how many are still unsettled.
   */
  /** How many carries are recorded as not yet finished; `settleCarries` settles them. */
  pendingCarries(): number { return this.edges(TYPES.carrying).length; }

  async settleCarries(): Promise<number> {
    let unsettled = 0;
    for (const edge of this.edges(TYPES.carrying)) if (await settleCarry(this.ports, edge) !== "settled") unsettled += 1;
    return unsettled;
  }

  /**
   * A Home-kept object (a todo list) is not moved between partitions: its plugin changes where it belongs, through a
   * Home-scoped mover, and keeps reading it at Home. Where it belonged before is kept for “从 … 移来”.
   */
  private async moveHome(object: PlacedObject, to: string, spaces: readonly PlacementSpaceView[]): Promise<PlacementMoveResponse> {
    if (!spaces.some(space => space.project_id === to)) throw new ActionError("placement.project_missing", placementText(this.ports, "workbench.index.couldn-t-find-where-move"));
    const { mover } = await placementTools(this.ports, object, "move");
    if (!mover) throw new ActionError("placement.not_movable", placementText(this.ports, "workbench.index.kind-item-only-lives-personal-space-can-be"));
    const read = await this.read(object);
    if (read.state !== "ok") throw new ActionError(`placement.${read.state}`, read.reason ?? placementText(this.ports, "workbench.index.can-t-read-item-right-now"));
    const from = placementBelongsOf(read) ?? PERSONAL_SPACE_PROJECT_ID;
    if (from === to) throw new ActionError("placement.same_location", placementText(this.ports, "workbench.index.s-already-here"));
    // Called from where it belongs now, so a plugin that scopes its objects by project finds it.
    const scope = await this.ports.scope(from === PERSONAL_SPACE_PROJECT_ID ? null : from);
    const result = await scope.client.invoke(scope.caller, mover, { subject: { kind: object.kind, id: object.id }, to_project_id: to }) as PlacementResult;
    if (result.subject.kind !== object.kind || result.subject.id !== object.id || result.project_id !== to) {
      throw new ActionError("placement.result_mismatch", placementText(this.ports, "workbench.index.plugin-s-move-result-doesn-t-match-request"));
    }
    await settleMove(this.ports, () => {
      this.remember(object);
      writeHomeBelonging(this.ports, object, from, to);
      this.rememberBelonging(object, to === PERSONAL_SPACE_PROJECT_ID ? null : to);
    }, () => moveBack(this.ports, object, to === PERSONAL_SPACE_PROJECT_ID ? null : to, from, text => placementText(this.ports, text)));
    return { object, location: homePlacementLocation(this.ports, to, spaces), open: await this.openOf(object) };
  }

  copy(input: PlacedObject, to: string, requestId: string): Promise<PlacementMoveResponse> {
    return copyPlacement(this.ports, this.access(), input, to, requestId);
  }

  /** The source hands its content (or what it chooses to hand over) to another plugin; the new object records where it came from. */
  convert(request: PlacementConvertRequest): Promise<PlacementConvertResponse> {
    return convertPlacement(this.ports, this.access(), request);
  }

  /** Read one object from its owner in its own partition. Deleted and unreadable stay distinct. */
  /**
   * A Home-kept object is read at Home; a plugin that scopes its readers by project (a todo list) may answer “not found”
   * there for one that belongs to a project, so it is read again inside the project it was last known to belong to.
   */
  private async read(object: PlacedObject): Promise<Read> {
    const first = await this.readIn(object, object.project_id);
    if (object.project_id !== null || first.state !== "missing") return first;
    const known = this.ports.ledger.query.get(ACCESS, key("belongs_to", object.kind, object.id))?.target.id;
    if (!known || known === PERSONAL_SPACE_PROJECT_ID) return first;
    const again = await this.readIn(object, known);
    return again.state === "ok" ? again : first;
  }

  /** Where a Home-kept object belongs now, remembered so it can be read again there (see read). */
  private rememberBelonging(object: PlacedObject, belongs: string | null): void {
    const target = belongs ?? PERSONAL_SPACE_PROJECT_ID;
    const current = this.ports.ledger.query.get(ACCESS, key("belongs_to", object.kind, object.id));
    if (current?.target.id === target) return;
    this.ports.ledger.commands.put(ACCESS, { key: key("belongs_to", object.kind, object.id), type: TYPES.belongs,
      source: identity(object.kind, object.id), target: projectRef(target), cause: "placement.seen" });
  }

  private readIn(object: PlacedObject, projectId: string | null): Promise<Read> {
    return readPlacementIn(this.ports, object, projectId, zh => placementText(this.ports, zh));
  }

  private async openOf(object: PlacedObject): Promise<PlacementOpen | null> {
    const read = await this.read(object);
    return read.context?.open ? { project_id: placementOpenProject(object, read), surface: read.context.open.surface, id: read.context.open.id } : null;
  }

  /** The title of what the relation points at, read from its owner like any object (the target kind comes from the relation's declaration). */
  private async targetTitle(projectId: string, kind: string, id: string): Promise<string | null> {
    const read = await this.read({ kind, id, project_id: projectId });
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

  /** This instance's reads and ledger writes, for the steps kept outside the class (describe, copy, convert). */
  private access(): PlacementInstanceAccess {
    return {
      locate: object => this.locate(object), read: object => this.read(object),
      remember: object => this.remember(object), openOf: object => this.openOf(object),
      edges: type => this.edges(type), targetTitle: (projectId, kind, id) => this.targetTitle(projectId, kind, id),
      rememberBelonging: (object, belongs) => this.rememberBelonging(object, belongs),
    };
  }
}

const ref = (view: ActionView): ActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

function writeProjectLocation(ports: PlacementPorts, object: PlacedObject, from: string, to: string): void {
  ports.ledger.commands.put(ACCESS, { key: key("location", object.kind, object.id), type: TYPES.location,
    source: identity(object.kind, object.id), target: projectRef(to), cause: `placement.move:${from}` });
  ports.ledger.commands.remove(ACCESS, key("used_in", object.kind, object.id, to), "placement.moved_into_project");
}

function writeHomeBelonging(ports: PlacementPorts, object: PlacedObject, from: string, to: string): void {
  ports.ledger.commands.put(ACCESS, { key: key("belonged_to", object.kind, object.id), type: TYPES.belonging,
    source: identity(object.kind, object.id), target: projectRef(from), cause: `placement.move:${to}` });
  ports.ledger.commands.remove(ACCESS, key("used_in", object.kind, object.id, to), "placement.moved_into_project");
}

/** The plugin has already moved the object. The lease and the ledger edge share its fate: a refusal moves it back and writes nothing; if it cannot move back after the edge was attempted, the edge is written again so the place the plugin kept is the place a later lookup finds. */
/** Records where a moved object went; when that is refused, the object is put back where it was (S-35) by `back`. */
async function settleMove(ports: PlacementPorts, write: () => void, back: () => Promise<void>): Promise<void> {
  let leased = false;
  try {
    await ports.beforeEffect?.();
    leased = true;
    write();
  } catch (error) {
    let undone = true, why: unknown;
    try { await back(); } catch (failure) { undone = false; why = failure; }
    if (!undone && leased) { try { write(); } catch { /* the plugin kept the new place */ } }
    // Why it did not come back rides on the refusal, so an object the plugin kept is not left without a trace.
    if (!undone && error instanceof Error && error.cause === undefined) error.cause = why;
    throw error;
  }
}

async function moveBack(ports: PlacementPorts, object: PlacedObject, at: string | null, to: string, t: (zh: string) => string): Promise<void> {
  // A Home-kept object (a todo) is moved by a Home action, which a project catalog does not list. A project object is moved
  // from the partition it just arrived in, so the caller's project is the place the plugin already wrote.
  const scope = await (ports.revert ?? ports.scope)(object.project_id === null ? null : at);
  const mover = placementToolOf(ports, await scope.client.discover(scope.caller), object.kind, "move");
  if (!mover) throw new ActionError("placement.not_movable", t("workbench.index.no-move-action-was-found-to-put"));
  const result = await scope.client.invoke(scope.caller, mover, { subject: { kind: object.kind, id: object.id }, to_project_id: to }) as PlacementResult;
  if (result.project_id !== to || result.subject.id !== object.id) throw new ActionError("placement.result_mismatch", t("workbench.index.putting-it-back-did-not-return-the"));
}

/** An object kept in its partition's own library is carried by its owner's three parts (`export` there, `put` at the target, `remove` there). */
interface CarryTools { source: PlacementScope; target: PlacementScope; exporter: ActionReference; putter: ActionReference; remover: ActionReference | null }

const notMovable = (ports: PlacementPorts) => new ActionError("placement.not_movable", placementText(ports, "workbench.index.items-plugin-can-t-be-moved-yet-copy"));

/**
 * The owner's parts for carrying an object from one partition to another, or null when its kind has no `export` where it is (the owner
 * moves it itself). Found by their types in each partition, never by a capability id; one that has `export` but no `put` at the target or
 * no `remove` where it is cannot move it. `revert` opens the partitions to put an object back (the refused call does not vote again).
 */
async function carryTools(ports: PlacementPorts, object: PlacedObject, from: string, to: string, revert = false): Promise<CarryTools | null> {
  const open = revert ? ports.revert ?? ports.scope : ports.scope;
  const source = await open(from);
  let here: readonly ActionView[];
  // A directory that cannot be read here offers no carry, as it offers no mover (`placementTools`): the move is refused as not movable.
  try { here = await source.client.discover(source.caller); } catch { return null; }
  const exporter = carryToolOf(ports, here, object.kind, isObjectExporter);
  if (!exporter) return null;
  const target = await open(to);
  const putter = carryToolOf(ports, await target.client.discover(target.caller), object.kind, isObjectPutter);
  const remover = carryToolOf(ports, here, object.kind, isObjectRemover);
  if (!putter) throw new ActionError("placement.target_unavailable", placementText(ports, "workbench.index.items-plugin-can-t-be-moved-yet-copy"));
  return { source, target, exporter, putter, remover };
}

function carryToolOf(ports: PlacementPorts, views: readonly ActionView[], kind: string, protocol: (action: ActionView["action"]) => boolean): ActionReference | null {
  const matches = views.filter(view => protocol(view.action) && view.action.subject_kinds.includes(kind) && view.availability.available);
  if (matches.length > 1) throw new ActionError("placement.target_unavailable", placementText(ports, "workbench.index.items-plugin-can-t-be-moved-yet-copy"),
    { kind: "conflict", details: { subject_kind: kind, actions: matches.map(ref) } });
  return matches[0] ? ref(matches[0]) : null;
}

async function carryExport(tools: CarryTools, object: PlacedObject, t: (zh: string) => string): Promise<PlacementExport> {
  const exported = await tools.source.client.invoke(tools.source.caller, tools.exporter, { subject: { kind: object.kind, id: object.id } }) as PlacementExport;
  if (exported.subject.kind !== object.kind || exported.subject.id !== object.id) throw new ActionError("placement.result_mismatch", t("workbench.index.plugin-s-move-result-doesn-t-match-request"));
  return exported;
}

/**
 * Export where it is, put it at the target under the same id, then remove it where it was while it is still the exported revision. A remove
 * that is refused (it changed meanwhile) takes back what was put, so the object is in exactly one partition either way. The same request
 * (object, revision, target) puts the same thing again, so a retry after a cut finds it rather than making a second one.
 */
async function carryMove(ports: PlacementPorts, object: PlacedObject, from: string, to: string, tools: CarryTools, t: (zh: string) => string, back = false): Promise<void> {
  if (!tools.remover) throw notMovable(ports);
  const exported = await carryExport(tools, object, t);
  const request = "move:" + createHash("sha256").update(JSON.stringify([object.kind, object.id, exported.revision, from, to])).digest("hex");
  // Written before the put: a cut between the put and the remove leaves this record, and `settleCarry` finishes the move or takes the put back.
  noteCarrying(ports, object, from, to, exported.revision);
  const put = await tools.target.client.invoke(tools.target.caller, tools.putter, { kind: object.kind, record: exported.record, request_id: request, target_id: object.id }) as PlacementResult;
  if (put.subject.kind !== object.kind || put.subject.id !== object.id || put.project_id !== to) {
    throw new ActionError("placement.result_mismatch", t(back ? "workbench.index.putting-it-back-did-not-return-the" : "workbench.index.plugin-s-move-result-doesn-t-match-request"));
  }
  try {
    const removed = await tools.source.client.invoke(tools.source.caller, tools.remover, { subject: { kind: object.kind, id: object.id }, revision: exported.revision }) as PlacementRemoved;
    if (!removed.removed) throw new ActionError("placement.result_mismatch", t("workbench.index.plugin-s-move-result-doesn-t-match-request"));
  } catch (error) {
    const undo = await carryTools(ports, object, to, from, true).catch(() => null);
    const remover = undo?.remover ?? null;
    try {
      if (!undo || !remover) throw notMovable(ports);
      await undo.source.client.invoke(undo.source.caller, remover, { subject: put.subject, revision: put.revision });
      // Taken back: the object is only where it was, as before the move.
      ports.ledger.commands.remove(ACCESS, carryingKey(object.kind, object.id), "placement.carry_undone");
    } catch (failure) { if (error instanceof Error && error.cause === undefined) error.cause = failure; }
    throw error;
  }
  // Carried back after its location was refused: no location is written for it, so it is settled here.
  if (back) ports.ledger.commands.remove(ACCESS, carryingKey(object.kind, object.id), "placement.carried_back");
}

const carryingKey = (kind: string, id: string) => key("carrying", kind, id);
const carryUnsettled = (ports: PlacementPorts) => placementErrors.carry_unsettled(placementText(ports, "workbench.index.item-changed-both-places-last-move"));

function noteCarrying(ports: PlacementPorts, object: PlacedObject, from: string, to: string, revision: string): void {
  ports.ledger.commands.put(ACCESS, { key: carryingKey(object.kind, object.id), type: TYPES.carrying, source: identity(object.kind, object.id),
    target: projectRef(to), cause: "placement.carry:" + JSON.stringify([from, revision]) });
}

/** The object as its owner exports it in this partition, or null when it is not there. */
async function exportedAt(ports: PlacementPorts, object: PlacedObject, at: string, other: string): Promise<{ tools: CarryTools; exported: PlacementExport | null } | null> {
  const tools = await carryTools(ports, object, at, other, true);
  if (!tools) return null;
  try {
    const exported = await tools.source.client.invoke(tools.source.caller, tools.exporter, { subject: { kind: object.kind, id: object.id } }) as PlacementExport;
    return { tools, exported };
  } catch (error) {
    if (error instanceof ActionError && error.kind === "not_found") return { tools, exported: null };
    throw error;
  }
}

/**
 * Settles one carry record by what the two partitions hold now, never by what the record guesses: put never landed → nothing to do; only at
 * the target → its location is the target; in both → the original goes while it is the revision carried, or else the put is taken back while
 * it is; changed in both → both are kept and the record stays ("unsettled").
 */
async function settleCarry(ports: PlacementPorts, edge: ContextEdge): Promise<"settled" | "unsettled"> {
  const kind = edge.source.object_type ?? "", id = edge.source.id, to = edge.target.id;
  let from: string, revision: string;
  try { [from, revision] = JSON.parse(edge.cause.slice("placement.carry:".length)) as [string, string]; } catch { return "unsettled"; }
  if (typeof from !== "string" || typeof revision !== "string") return "unsettled";
  const object: PlacedObject = { kind, id, project_id: from };
  const done = (cause: string) => { ports.ledger.commands.remove(ACCESS, edge.key, cause); return "settled" as const; };
  const target = await exportedAt(ports, { ...object, project_id: to }, to, from);
  if (!target?.exported) return done("placement.carry_not_put");
  const source = await exportedAt(ports, object, from, to);
  if (source && source.exported && source.exported.revision !== revision) {
    if (target.exported.revision !== revision || !target.tools.remover) return "unsettled";
    await ports.beforeEffect?.();
    await target.tools.source.client.invoke(target.tools.source.caller, target.tools.remover, { subject: { kind, id }, revision });
    return done("placement.carry_undone");
  }
  await ports.beforeEffect?.();
  if (source?.exported) {
    if (!source.tools.remover) return "unsettled";
    await source.tools.source.client.invoke(source.tools.source.caller, source.tools.remover, { subject: { kind, id }, revision });
  }
  const location = ports.ledger.query.get(ACCESS, key("location", kind, id));
  if (location?.target.id !== to) writeProjectLocation(ports, object, from, to);
  return done("placement.carried");
}

/** The ledger access this service writes as; the Host authorizes exactly this partition. */
export const PLACEMENT_LEDGER_ACCESS = ACCESS;

/** The caller has already read these candidates from their owners at the supplied locations. */
export function placementRelationsFor(ledger: ContextLedgerRelationReader, projectId: string, candidates: readonly PlacedObject[]): ContextEdge[] {
  const objects = candidates.filter(object => object.project_id === projectId || object.project_id === null);
  if (objects.length < 2) return [];
  const locations = new Map(objects.map(object => [key(object.kind, object.id), object.project_id ?? HOME]));
  const refs = [...objects.map(object => identity(object.kind, object.id)), ...Array.from(new Set(locations.values()), projectRef)];
  const edges = ledger.activeBetween(ACCESS, refs, [TYPES.location, TYPES.copied, TYPES.derived]);
  const found = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== TYPES.location || edge.actor_id !== ACCESS.actor_id || !edge.source.object_type) continue;
    const object = key(edge.source.object_type, edge.source.id);
    if (edge.key === key("location", edge.source.object_type, edge.source.id) && locations.get(object) === edge.target.id) found.add(object);
  }
  return edges.filter(edge => {
    const { source, target } = edge;
    if (edge.actor_id !== ACCESS.actor_id || !source.object_type || !target.object_type) return false;
    const kind = edge.type === TYPES.copied ? "copied_from" : edge.type === TYPES.derived ? "derived_from" : undefined;
    return kind !== undefined && edge.key === key(kind, source.object_type, source.id)
      && found.has(key(source.object_type, source.id)) && found.has(key(target.object_type, target.id));
  });
}

interface PlacementInstanceAccess {
  locate(object: PlacedObject): { object: PlacedObject; moved: boolean };
  read(object: PlacedObject): Promise<Read>;
  remember(object: PlacedObject): void;
  openOf(object: PlacedObject): Promise<PlacementOpen | null>;
  edges(type: string): ContextEdge[];
  targetTitle(projectId: string, kind: string, id: string): Promise<string | null>;
  rememberBelonging(object: PlacedObject, belongs: string | null): void;
}

/** What an object is, where it lives and what it is linked to, read through one service instance (`PlacementService.describe`). */
async function describePlacement(ports: PlacementPorts, self: PlacementInstanceAccess, input: PlacedObject): Promise<PlacementDescription> {
  const spaces = await ports.spaces();
  const located = self.locate(input);
  const object = located.object;
  const read = await self.read(object);
  const title = read.context?.title || ports.titles.get(object.kind, object.id) || placementText(ports, "workbench.index.untitled");
  const location = read.state === "missing" && read.plugin === null ? null
    : object.project_id === null ? homePlacementLocation(ports, placementBelongsOf(read), spaces) : placementLocation(ports, object.project_id, spaces);
  const associations: PlacementAssociation[] = [];
  for (const edge of self.edges(TYPES.used).filter(edge => sameObject(edge.source, object.kind, object.id))) {
    const project = spaces.find(space => space.project_id === edge.target.id);
    associations.push({ key: edge.key, type: "used_in", label: project ? placementText(ports, "workbench.index.used-project-name", { name: project.title }) : placementText(ports, "workbench.index.used-deleted-project"),
      target: { kind: "project", project_id: edge.target.id, title: project?.title ?? placementText(ports, "workbench.index.deleted-project") }, since: edge.recorded_at, removable: true });
  }
  // A target's owner keeps the bindings in its own project: the one the object lives in, and every project it was attached in from
  // elsewhere or before a move.
  const attachedIn = new Set<string>(object.project_id === null ? [] : [object.project_id]);
  for (const edge of self.edges(TYPES.attached)) if (sameObject(edge.source, object.kind, object.id)) attachedIn.add(edge.target.id);
  // The owners are whoever declares a 「挂到…」 relation in that project's directory, so the lookups below name no plugin.
  const relations = new Map<string, Promise<AttachRelations>>();
  const relationsIn = (projectId: string | null) => {
    const cached = relations.get(projectId ?? HOME);
    return cached ?? relations.set(projectId ?? HOME, attachRelations(ports, projectId)).get(projectId ?? HOME)!;
  };
  const bound: { project_id: string; target: ActionSubject; noun: string }[] = [];
  const subject = { kind: object.kind, id: object.id };
  for (const projectId of attachedIn) {
    for (const relation of (await relationsIn(projectId)).all) {
      if (!relation.relates(object.kind)) continue;
      for (const target of await attachTargetsOf(ports, projectId, relation, subject)) bound.push({ project_id: projectId, target, noun: relation.noun });
    }
  }
  for (const binding of bound) {
    const target = await self.targetTitle(binding.project_id, binding.target.kind, binding.target.id);
    const name = target ?? placementText(ports, "workbench.index.title-unavailable");
    associations.push({ key: attachedKey(binding.project_id, binding.target, subject), type: "attached",
      label: binding.project_id === object.project_id ? placementText(ports, "workbench.placement.attached-to", { noun: binding.noun, name })
        : placementText(ports, "workbench.placement.attached-to-with-place", { noun: binding.noun, name, place: placementLocation(ports, binding.project_id, spaces).title }),
      target: { kind: "attached", project_id: binding.project_id, object: { kind: binding.target.kind, id: binding.target.id }, noun: binding.noun, title: target ?? "" },
      since: null, removable: true });
  }
  // Kept by the object's own plugin (a Feed item's Goal, a document's 「挂到…」 there): changed there, not here.
  const kept = read.context?.attached_to ?? [];
  const keptRelations = kept.length ? await relationsIn(object.project_id) : null;
  for (const subject of kept) {
    if (subject.kind === object.kind && subject.id === object.id) continue;
    if (bound.some(binding => binding.target.kind === subject.kind && binding.target.id === subject.id && binding.project_id === object.project_id)) continue;
    const noun = keptRelations!.noun(subject.kind) ?? placementText(ports, "workbench.index.attached-unknown-noun");
    const target = object.project_id === null ? null : await self.targetTitle(object.project_id, subject.kind, subject.id);
    associations.push({ key: null, type: "attached", label: placementText(ports, "workbench.index.noun-name-linked-plugin", { noun, name: target ?? placementText(ports, "workbench.index.title-unavailable"), plugin: read.plugin?.title ?? "" }),
      target: { kind: "attached", project_id: object.project_id, object: { kind: subject.kind, id: subject.id }, noun, title: target ?? "" }, since: null, removable: false });
  }
  // A conversion names what the other end is (a Goal, or the plugin that keeps it), so a document and a Goal made from one spark read apart.
  const origin = (label: (title: string, noun: string | null) => string, kind: PlacementAssociation["type"]) => async (edge: ContextEdge, other: ObjectRef) => {
    const found = self.locate({ kind: other.object_type ?? "", id: other.id, project_id: null }).object;
    const otherRead = await self.read(found);
    const otherTitle = otherRead.context?.title || ports.titles.get(found.kind, found.id) || placementText(ports, "workbench.index.untitled");
    const where = otherRead.state === "missing" ? placementText(ports, "workbench.index.original-was-deleted") : placementLocation(ports, found.project_id, spaces).title;
    const noun = (await relationsIn(found.project_id)).noun(found.kind);
    const what = kind.startsWith("derived") && !noun ? otherRead.plugin?.title ?? "" : "";
    associations.push({ key: null, type: kind, label: [label(otherTitle, noun), what, where].filter(Boolean).join(" · "),
      target: { kind: "object", object: found, title: otherTitle, state: otherRead.state, location: otherRead.state === "ok" ? placementLocation(ports, found.project_id, spaces) : null, plugin: otherRead.plugin },
      since: edge.recorded_at, removable: false });
  };
  const derivedFrom = ports.ledger.query.get(ACCESS, key("derived_from", object.kind, object.id));
  if (derivedFrom) await origin((title, noun) => noun ? placementText(ports, "workbench.index.noun-title", { noun, title }) : placementText(ports, "workbench.index.title", { title }), "derived_from")(derivedFrom, derivedFrom.target);
  for (const edge of self.edges(TYPES.derived).filter(edge => sameObject(edge.target, object.kind, object.id))) {
    await origin((title, noun) => noun ? placementText(ports, "workbench.index.made-into-noun-title", { noun, title }) : placementText(ports, "workbench.index.turned-into-title", { title }), "derived_into")(edge, edge.source);
  }
  const copiedFrom = ports.ledger.query.get(ACCESS, key("copied_from", object.kind, object.id));
  if (copiedFrom) await origin(title => placementText(ports, "workbench.index.copied-title", { title }), "copied_from")(copiedFrom, copiedFrom.target);
  for (const edge of self.edges(TYPES.copied).filter(edge => sameObject(edge.target, object.kind, object.id))) {
    await origin(title => placementText(ports, "workbench.index.copied-title-2", { title }), "copied_into")(edge, edge.source);
  }
  const tools = read.state === "ok" ? await placementTools(ports, object) : { mover: null, copier: null };
  const here = object.project_id ?? placementBelongsOf(read);
  if (!ports.surfaceSource && object.project_id === null && read.state === "ok") { await ports.beforeEffect?.(); self.rememberBelonging(object, here); }
  // A Home-kept object that changed where it belongs remembers where it was, as a moved object does.
  const belonged = object.project_id === null ? ports.ledger.query.get(ACCESS, key("belonged_to", object.kind, object.id)) : null;
  const before = belonged && belonged.target.id !== (here ?? PERSONAL_SPACE_PROJECT_ID) ? belonged.target.id : null;
  return {
    state: read.state, reason: read.reason, object, title, plugin: read.plugin, location,
    moved_from: located.moved ? placementLocation(ports, input.project_id, spaces) : before ? homePlacementLocation(ports, before, spaces) : null,
    associations,
    can: { move: !!tools.mover, copy: !!tools.copier, use_in_project: read.state === "ok" && spaces.some(space => space.kind === "project" && space.project_id !== here) },
    open: read.context?.open ? { project_id: placementOpenProject(object, read), surface: read.context.open.surface, id: read.context.open.id } : null,
  };
}

function placementText(ports: PlacementPorts, zh: string, vars: Record<string, string | number> = {}): string {
  // Called as `text(…)`, the port's declared translator name, so the translation check reads the keys at every `placementText` call.
  const { text } = ports;
  if (text) return text(zh, vars);
  return Object.entries(vars).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), zh);
}

/** Where a Home-kept object belongs, as its reader says; null for the personal space or when the plugin does not say. */
function placementBelongsOf(read: Read): string | null {
  const value = read.context?.project_id ?? null;
  return value && value !== PERSONAL_SPACE_PROJECT_ID ? value : null;
}

/** A Home-kept object belonging to a project is shown in it, but still read at Home: its access stays the Home one. */
function homePlacementLocation(ports: PlacementPorts, belongs: string | null, spaces: readonly PlacementSpaceView[]): PlacementLocation {
  if (!belongs || belongs === PERSONAL_SPACE_PROJECT_ID) return placementLocation(ports, null, spaces);
  return { ...placementLocation(ports, belongs, spaces), access: "home", access_label: placementText(ports, "workbench.index.only-assistants-authorize") };
}

function placementLocation(ports: PlacementPorts, projectId: string | null, spaces: readonly PlacementSpaceView[]): PlacementLocation {
  // Home-level plugins answer any project that was granted them, so their content is not “only you”.
  if (projectId === null) return { kind: "personal", project_id: null, title: placementText(ports, "workbench.index.personal-space"), access: "home", access_label: placementText(ports, "workbench.index.only-assistants-authorize") };
  if (projectId === PERSONAL_SPACE_PROJECT_ID) return { kind: "personal", project_id: projectId, title: placementText(ports, "workbench.index.personal-space"), access: "private", access_label: placementText(ports, "workbench.index.only") };
  const space = spaces.find(entry => entry.project_id === projectId);
  return { kind: "project", project_id: projectId, title: placementText(ports, "workbench.index.project-name", { name: space?.title ?? placementText(ports, "workbench.index.deleted-project") }), access: "project", access_label: placementText(ports, "workbench.index.visible-project") };
}

function placementToolOf(ports: PlacementPorts, views: readonly ActionView[], kind: string, operation: "move" | "copy"): ActionReference | null {
  const protocol = operation === "move" ? isObjectMover : isObjectCopier;
  const matches = views.filter(view => protocol(view.action) && view.action.subject_kinds.includes(kind) && view.availability.available);
  if (matches.length > 1) {
    throw new ActionError("placement.target_unavailable", placementText(ports, operation === "move"
      ? "workbench.index.items-plugin-can-t-be-moved-yet-copy" : "workbench.index.items-plugin-can-t-be-copied-elsewhere-yet"),
    { kind: "conflict", details: { operation, subject_kind: kind, actions: matches.map(ref) } });
  }
  return matches[0] ? ref(matches[0]) : null;
}

async function placementTools(ports: PlacementPorts, object: PlacedObject, operation?: "move" | "copy"): Promise<{ mover: ActionReference | null; copier: ActionReference | null }> {
  let views: readonly ActionView[];
  try {
    const scope = await ports.scope(object.project_id);
    views = await scope.client.discover(scope.caller);
  } catch { return { mover: null, copier: null }; }
  // Discovery can be unavailable; a discovered conflict must reach the caller rather than look like an absent tool.
  return { mover: operation === "copy" ? null : placementToolOf(ports, views, object.kind, "move"),
    copier: operation === "move" ? null : placementToolOf(ports, views, object.kind, "copy") };
}

/**
 * One owner's relation in one partition (「挂到…」, PG-032; specs/plugin-equal-standing/contract-design.md §2.2): the parts it declares
 * with `placement_relation`, in the platform's shape for each (`definePlacementRelationAction`), found by that declaration, never by a
 * capability id placement knows. A part the owner does not offer here (not declared, not registered, or unavailable now) is null. A
 * relation whose parts are in another shape (a background task's `serves`, kept by the mainline service) is not placement's to offer.
 */
interface AttachRelation {
  /** The declared relation name. */
  relation: string;
  /** The owner: the plugin whose objects of `target_kind` others attach to. */
  plugin_id: string;
  noun: string;
  target_kind: string;
  /** The owner's view that lists what is attached to a target (`open_view`), when it declares one. */
  open_view?: string;
  /** Whether it relates objects of this kind (its `list` part's subject kinds; none: any object). */
  relates(kind: string): boolean;
  list: ActionReference | null;
  bind: ActionReference | null;
  release: ActionReference | null;
  candidates: ActionReference | null;
  create: ActionReference | null;
}
interface AttachRelations {
  readonly all: readonly AttachRelation[];
  /** The relation whose targets are of this subject kind, if one is declared here. */
  of(kind: string): AttachRelation | null;
  /** The noun its owner gives a kind of target; null when no relation here has that kind. */
  noun(kind: string): string | null;
}
const NO_RELATIONS: AttachRelations = { all: [], of: () => null, noun: () => null };

/** Codes this package owns beyond the platform's `placement.same_location`; the rest are raised as plain `ActionError`s where they happen. */
const placementErrors = defineErrorCodes("placement", { relation_ambiguous: "conflict", carry_unsettled: "conflict" });

/**
 * Every relation in a partition. One relation has one owner, and one kind of target is one relation's: two providers declaring the same
 * relation, or two relations ending on the same kind, would make "who keeps this binding" a guess, so that is refused, naming the
 * providers, and none of their actions is called.
 */
async function attachRelationsOf(ports: PlacementPorts, scope: PlacementScope): Promise<AttachRelations> {
  const views = (await scope.client.discover(scope.caller)).filter(view => view.availability.available && view.action.placement_relation !== undefined
    && isPlacementRelationPart(view.action, view.action.placement_relation.role));
  const byName = new Map<string, ActionView[]>();
  for (const view of views) byName.set(view.action.placement_relation!.relation, [...byName.get(view.action.placement_relation!.relation) ?? [], view]);
  const ambiguous = (relation: string, same: readonly ActionView[]) => {
    const providers = [...new Set(same.map(view => view.provider.provider_id))];
    const { text } = ports;
    const separator = text ? text("common.list.separator") : ", ";
    return placementErrors.relation_ambiguous(placementText(ports, "workbench.index.more-than-one-plugin-keeps-relation-link-providers", { relation, providers: providers.join(separator) }), { relation, providers });
  };
  const all: AttachRelation[] = [];
  for (const [name, parts] of byName) {
    if (new Set(parts.map(view => view.provider.provider_id)).size > 1) throw ambiguous(name, parts);
    const play = (role: PlacementRelationRole) => {
      const found = parts.filter(view => view.action.placement_relation!.role === role);
      if (found.length > 1) throw ambiguous(name, found);
      return found[0] ? ref(found[0]) : null;
    };
    const list = parts.find(view => view.action.placement_relation!.role === "list"), target = list?.action.placement_relation!.target;
    // Without its list part a relation says neither what it ends on nor what an object is attached to: there is nothing to offer.
    if (!list || !target) continue;
    const kinds = list.action.subject_kinds;
    all.push({ relation: name, plugin_id: list.provider.plugin_id ?? list.provider.provider_id, noun: target.noun, target_kind: target.kind, ...(target.open_view ? { open_view: target.open_view } : {}),
      relates: kind => kinds.length === 0 || kinds.includes(kind),
      list: play("list"), bind: play("bind"), release: play("release"), candidates: play("candidates"), create: play("create") });
  }
  for (const relation of all) {
    const same = all.filter(other => other.target_kind === relation.target_kind);
    if (same.length > 1) throw ambiguous(relation.target_kind, views.filter(view => same.some(one => one.relation === view.action.placement_relation!.relation)));
  }
  const of = (kind: string) => all.find(relation => relation.target_kind === kind) ?? null;
  return { all, of, noun: kind => of(kind)?.noun ?? null };
}

/** Like `attachRelationsOf`, for a partition that may be gone: it has no relations. */
async function attachRelations(ports: PlacementPorts, projectId: string | null): Promise<AttachRelations> {
  try { return await attachRelationsOf(ports, await ports.scope(projectId)); } catch (error) {
    // A partition that is gone has no relation; a relation with two owners is a refusal, not an absence.
    if (error instanceof ActionError && error.code === "placement.relation_ambiguous") throw error;
    return NO_RELATIONS;
  }
}

/** What one object is attached to through one relation, as its owner says; nothing when the owner cannot answer now. */
async function attachTargetsOf(ports: PlacementPorts, projectId: string, relation: AttachRelation, subject: ActionSubject): Promise<ActionSubject[]> {
  try {
    if (!relation.list) return [];
    const scope = await ports.scope(projectId);
    const result = await scope.client.invoke(scope.caller, relation.list, { subject }) as PlacementRelationResult;
    return result.targets.filter(target => target.kind === relation.target_kind);
  } catch { return []; }
}

/** Opened where it is: its partition, or the project a Home-kept object belongs to (null: wherever the person is). */
function placementOpenProject(object: PlacedObject, read: Read): string | null {
  return object.project_id ?? placementBelongsOf(read);
}

/**
 * What can be attached to in one location, by kind: each relation that offers its candidates. Its owner names them by reference only;
 * their titles are read from them like any object's.
 */
async function placementAttachTargets(ports: PlacementPorts, access: PlacementInstanceAccess, projectId: string, object: PlacedObject): Promise<PlacementAttachKindView[]> {
  const scope = await ports.scope(projectId);
  const kinds: PlacementAttachKindView[] = [];
  for (const relation of (await attachRelationsOf(ports, scope)).all) {
    if (!relation.candidates || !relation.bind || !relation.relates(object.kind)) continue;
    const result = await scope.client.invoke(scope.caller, relation.candidates, { subject: { kind: object.kind, id: object.id } }) as PlacementRelationCandidates;
    const offered = result.targets.filter(target => target.subject.kind === relation.target_kind);
    const titles = await Promise.all(offered.map(target => access.targetTitle(projectId, target.subject.kind, target.subject.id)));
    kinds.push({ kind: relation.target_kind, noun: relation.noun, ...(relation.open_view ? { open_view: relation.open_view } : {}), targets: offered.map((target, index) => ({ id: target.subject.id, title: titles[index] ?? "", current: target.current })) });
  }
  return kinds;
}

async function copyPlacement(ports: PlacementPorts, access: PlacementInstanceAccess, input: PlacedObject, to: string, requestId: string): Promise<PlacementMoveResponse> {
  const spaces = await ports.spaces();
  const object = access.locate(input).object;
  if (object.project_id === null) throw new ActionError("placement.not_copyable", placementText(ports, "workbench.index.kind-item-only-lives-personal-space-save-another"));
  if (!spaces.some(space => space.project_id === to)) throw new ActionError("placement.project_missing", placementText(ports, "workbench.index.couldn-t-find-where-copy"));
  const t = (text: string) => placementText(ports, text);
  const carried = await carryTools(ports, object, object.project_id, to);
  let result: PlacementResult;
  if (carried) {
    // A copy is a new object at the target: the owner's `put` makes it, and the same request makes the same one again.
    const exported = await carryExport(carried, object, t);
    result = await carried.target.client.invoke(carried.target.caller, carried.putter, { kind: object.kind, record: exported.record, request_id: requestId }) as PlacementResult;
  } else {
    const { copier } = await placementTools(ports, object, "copy");
    if (!copier) throw new ActionError("placement.not_copyable", placementText(ports, "workbench.index.items-plugin-can-t-be-copied-elsewhere-yet"));
    const scope = await ports.scope(object.project_id);
    result = await scope.client.invoke(scope.caller, copier, { subject: { kind: object.kind, id: object.id }, to_project_id: to, request_id: requestId }) as PlacementResult;
  }
  if (result.project_id !== to || result.subject.kind !== object.kind) throw new ActionError("placement.result_mismatch", placementText(ports, "workbench.index.plugin-returned-copy-that-doesn-t-match-request"));
  const copy = { kind: result.subject.kind, id: result.subject.id, project_id: to };
  await ports.beforeEffect?.();
  access.remember(object);
  access.remember(copy);
  ports.ledger.commands.put(ACCESS, { key: key("copied_from", copy.kind, copy.id), type: TYPES.copied,
    source: identity(copy.kind, copy.id), target: identity(object.kind, object.id), cause: "placement.copy" });
  return { object: copy, location: placementLocation(ports, to, spaces), open: await access.openOf(copy) };
}

/** The source hands its content (or what it chooses to hand over) to another plugin; the new object records where it came from. */
async function convertPlacement(ports: PlacementPorts, access: PlacementInstanceAccess, request: PlacementConvertRequest): Promise<PlacementConvertResponse> {
  const spaces = await ports.spaces();
  if (!spaces.some(space => space.project_id === request.to_project_id)) throw new ActionError("placement.project_missing", placementText(ports, "workbench.index.couldn-t-find-where-save"));
  const source = access.locate(request.source).object;
  const read = await access.read(source);
  // A plugin that hands its content over itself (payload) may have no object reader yet; a deleted source never converts.
  if (read.state === "missing" || (read.state !== "ok" && !request.payload)) throw new ActionError(`placement.${read.state}`, read.reason ?? placementText(ports, "workbench.index.can-t-read-original-right-now"));
  const title = (request.payload?.title ?? read.context!.title).trim() || placementText(ports, "workbench.index.untitled");
  const body = request.payload?.body ?? read.context!.content;
  const sourceTitle = read.context?.title ?? request.payload!.title;
  if (!read.context) await ports.beforeEffect?.();
  const from = read.plugin ? `${read.plugin.title} · ${sourceTitle}` : sourceTitle;
  const scope = await ports.scope(request.to_project_id);
  const views = await scope.client.discover(scope.caller);
  let created: PlacedObject, noun: string | undefined;
  if ("attach_kind" in request.to) {
    const relation = (await attachRelationsOf(ports, scope)).of(request.to.attach_kind);
    if (!relation?.create) throw new ActionError("placement.target_unavailable", placementText(ports, "workbench.index.attach-create-unavailable"));
    // The owner makes a target named so and attaches the source to it; it returns what the source is attached to, the new one first.
    const result = await scope.client.invoke(scope.caller, relation.create, { subject: { kind: source.kind, id: source.id }, name: [...title].slice(0, PLACEMENT_RELATION_LIMITS.name).join(""),
      request_id: `placement:${request.request_id}`.slice(0, PLACEMENT_RELATION_LIMITS.request_id),
      read: { title: [...sourceTitle].slice(0, PLACEMENT_RELATION_LIMITS.title).join(""), ...(read.context?.revision ? { revision: read.context.revision.slice(0, PLACEMENT_RELATION_LIMITS.revision) } : {}),
        excerpt: [...body].slice(0, PLACEMENT_RELATION_LIMITS.excerpt).join("") } }) as PlacementRelationResult;
    const made = result.targets[0];
    if (!made || made.kind !== relation.target_kind) throw new ActionError("placement.result_mismatch", placementText(ports, "workbench.index.plugin-returned-copy-that-doesn-t-match-request"));
    created = { kind: made.kind, id: made.id, project_id: request.to_project_id };
    noun = relation.noun;
  } else {
    const station = request.to.station;
    const receive = views.find(view => view.action.workflow_content?.id === station && view.action.workflow_content.role === "receive" && view.availability.available);
    if (!receive) throw new ActionError("placement.target_unavailable", placementText(ports, "workbench.index.no-plugin-here-can-receive-content"));
    let url = request.payload?.url;
    // Only a source verified by its owner can supply a binding in the reserved namespace.
    if (source.kind === "form" && read.state === "ok" && read.context?.subject.kind === source.kind && read.context.subject.id === source.id) {
      url = "molis-source://form/" + encodeURIComponent(source.id);
    } else if (url?.trimStart().toLowerCase().startsWith("molis-source://")) {
      url = undefined;
    }
    const item = await scope.client.invoke(scope.caller, ref(receive), { title, body, source: from, ...(url != null ? { url } : {}), request_id: `placement:${request.request_id}` }) as WorkflowItemRef;
    // The station's object is of the kind it declares (Jelly's is a note, not a calendar entry).
    if (!receive.action.subject_kinds.includes(item.subject.kind)) throw new ActionError("placement.result_mismatch", placementText(ports, "workbench.index.plugin-returned-copy-that-doesn-t-match-request"));
    created = { kind: item.subject.kind, id: item.subject.id, project_id: request.to_project_id };
  }
  const actual = ports.surfaceSource ? await access.read(created) : undefined;
  if (actual && actual.state !== "ok") throw new ActionError("actions.outcome_unknown", "新对象的读取结果需要到接收方核对");
  await ports.beforeEffect?.();
  if (!read.context) ports.titles.set(source.kind, source.id, sourceTitle);
  access.remember(source);
  access.remember(created);
  ports.ledger.commands.put(ACCESS, { key: key("derived_from", created.kind, created.id), type: TYPES.derived,
    source: identity(created.kind, created.id), target: identity(source.kind, source.id), cause: `placement.convert:${"attach_kind" in request.to ? request.to.attach_kind : request.to.station}` });
  const createdRead = actual ?? await access.read(created);
  const open = actual ? actual.context?.open && { ...actual.context.open, project_id: placementOpenProject(created, actual) } || null : await access.openOf(created);
  return { object: created, title: createdRead.context?.title ?? title, location: placementLocation(ports, created.project_id, spaces), open, ...(noun ? { noun } : {}) };
}
