import type { STATE_VOCABULARIES } from "../platform/state-vocabulary.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition, ActionSubject } from "../platform/actions.js";
import { MATERIAL_REF_SCHEMA, type MaterialRef } from "../platform/project-materials.js";

export const servicesPlacementContract = {
  contractId: /* @version contract.io.molis.work.service.placement "io.molis.work.service.placement.v{version}" */ "io.molis.work.service.placement.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.placement */ 1,
  maturity: "partial",
  ssot: "specs/archive/work-placement/spec.md",
} as const satisfies ContractDescriptor;

export const PLACEMENT_PROVIDER_ID = "system.placement";
export const PLACEMENT_READ_PERMISSION = "placement:read";
export const PLACEMENT_WRITE_PERMISSION = "placement:write";
export const PLACEMENT_PERMISSIONS = [PLACEMENT_READ_PERMISSION, PLACEMENT_WRITE_PERMISSION] as const;

/**
 * One object by its owner's identity. `project_id` is the partition it was last seen in: a project, the personal space
 * (`personal`), or null for Home-level plugins whose content is always personal (Shelf, Cognia, Jelly…).
 */
export interface PlacedObject { kind: string; id: string; project_id: string | null }
/** `private`: only the person (the personal space); `home`: the person, and assistants or workflows they granted the plugin to; `project`: the project's environment. */
export type PlacementAccess = "private" | "home" | "project";
/** Where an object is, in words a person reads: never an internal id. */
export interface PlacementLocation {
  kind: "personal" | "project";
  /** The partition: a project id, `personal`, or null for Home-level content. */
  project_id: string | null;
  title: string;
  access: PlacementAccess;
  access_label: string;
}
export type PlacementObjectState = keyof typeof STATE_VOCABULARIES.placementObject.states;
export type PlacementAssociationType = "used_in" | "attached" | "derived_from" | "derived_into" | "copied_from" | "copied_into";
/** What an object is attached to (「挂到…」): another plugin's object, by its subject kind, and the noun its owner gives that kind. */
export interface PlacementAttachedTarget { kind: "attached"; project_id: string | null; object: { kind: string; id: string }; noun: string; title: string }
export interface PlacementAssociation {
  /** Ledger key for links the system owns, and for attachments placement made; null for relations the owner plugin keeps itself. */
  key: string | null;
  type: PlacementAssociationType;
  label: string;
  /** The other end: a project, what the object is attached to, or another object. */
  target: { kind: "project"; project_id: string; title: string } | PlacementAttachedTarget
    | { kind: "object"; object: PlacedObject; title: string; state: PlacementObjectState; location: PlacementLocation | null;
      /** The plugin that keeps the object, as its owner names it; null when nothing reads it (a deleted object, a disabled plugin). */
      plugin: { plugin_id: string; title: string } | null };
  since: string | null;
  removable: boolean;
}
export interface PlacementOpen { project_id: string | null; surface: string; id: string }
export interface PlacementDescription {
  state: PlacementObjectState;
  /** Why it cannot be read now, or that it was deleted; null when ok. */
  reason: string | null;
  /** Where it is now: moves are followed, so an old reference still finds it. */
  object: PlacedObject;
  title: string;
  plugin: { plugin_id: string; title: string } | null;
  location: PlacementLocation | null;
  moved_from: PlacementLocation | null;
  associations: PlacementAssociation[];
  can: { move: boolean; copy: boolean; use_in_project: boolean };
  open: PlacementOpen | null;
}
export interface PlacementRelatedItem {
  key: string;
  object: PlacedObject;
  title: string;
  state: PlacementObjectState;
  reason: string | null;
  location: PlacementLocation | null;
  plugin: { plugin_id: string; title: string } | null;
  since: string;
  open: PlacementOpen | null;
}
/** A plugin's station that receives content, or a new target of a 「挂到…」 relation (its subject kind: a Goal is `goal`). */
export type PlacementConvertTarget = { station: string } | { attach_kind: string };
export interface PlacementConvertRequest {
  source: PlacedObject;
  to: PlacementConvertTarget;
  to_project_id: string;
  request_id: string;
  /** What the source hands over, when it is not the object's own content (a form's responses as CSV). */
  payload?: { title: string; body: string; url?: string | null };
}
export interface PlacementConvertResponse {
  object: PlacedObject; title: string; location: PlacementLocation; open: PlacementOpen | null;
  /** Made into a target of a 「挂到…」 relation: the noun its owner gives that kind (a Goal), so the person reads what it became. */
  noun?: string;
}
export interface PlacementMoveResponse { object: PlacedObject; location: PlacementLocation; open: PlacementOpen | null }
export interface PlacementSpaceView { project_id: string; title: string; kind: "personal" | "project" }

const id = { type: "string", minLength: 1, maxLength: 200 };
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: "null" }, schema] });
const projectRef = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" };
const kindSchema = { type: "string", minLength: 1, maxLength: 80 };
export const PLACED_OBJECT_SCHEMA = { type: "object", properties: { kind: { ...id, maxLength: 80 }, id, project_id: nullable(projectRef) },
  required: ["kind", "id", "project_id"], additionalProperties: false };
const location = { type: "object", properties: { kind: { enum: ["personal", "project"] }, project_id: nullable(projectRef), title: { type: "string" },
  access: { enum: ["private", "home", "project"] }, access_label: { type: "string" } }, required: ["kind", "project_id", "title", "access", "access_label"], additionalProperties: false };
const open = nullable({ type: "object", properties: { project_id: nullable(projectRef), surface: { type: "string" }, id: { type: "string" } }, required: ["project_id", "surface", "id"], additionalProperties: false });
const state = { enum: ["ok", "missing", "unavailable"] };
const plugin = nullable({ type: "object", properties: { plugin_id: { type: "string" }, title: { type: "string" } }, required: ["plugin_id", "title"], additionalProperties: false });
const association = { type: "object", properties: { key: { type: ["string", "null"] }, type: { enum: ["used_in", "attached", "derived_from", "derived_into", "copied_from", "copied_into"] },
  label: { type: "string" }, target: { type: "object" }, since: { type: ["string", "null"] }, removable: { type: "boolean" } },
  required: ["key", "type", "label", "target", "since", "removable"], additionalProperties: false };
const description = { type: "object", properties: { state, reason: { type: ["string", "null"] }, object: PLACED_OBJECT_SCHEMA, title: { type: "string" }, plugin,
  location: nullable(location), moved_from: nullable(location), associations: { type: "array", items: association },
  can: { type: "object", properties: { move: { type: "boolean" }, copy: { type: "boolean" }, use_in_project: { type: "boolean" } }, required: ["move", "copy", "use_in_project"], additionalProperties: false },
  open }, required: ["state", "reason", "object", "title", "plugin", "location", "moved_from", "associations", "can", "open"], additionalProperties: false };
const related = { type: "object", properties: { key: { type: "string" }, object: PLACED_OBJECT_SCHEMA, title: { type: "string" }, state, reason: { type: ["string", "null"] },
  location: nullable(location), plugin, since: { type: "string" }, open }, required: ["key", "object", "title", "state", "reason", "location", "plugin", "since", "open"], additionalProperties: false };
const moved = { type: "object", properties: { object: PLACED_OBJECT_SCHEMA, location, open }, required: ["object", "location", "open"], additionalProperties: false };

const read = { kind: "query" as const, scope: "home" as const, scheduling: "concurrent" as const, subject_kinds: [] as string[],
  audiences: ["user", "agent"] as ("user" | "agent")[], permissions: [PLACEMENT_READ_PERMISSION] };
/** Changing where something is or who can read it is the person's decision; agents propose, never apply. */
const write = { kind: "operation" as const, scope: "home" as const, subject_kinds: [] as string[], effect: "write" as const,
  audiences: ["user"] as ("user")[], permissions: [PLACEMENT_READ_PERMISSION, PLACEMENT_WRITE_PERMISSION] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });

/** Registered once by the Host as `system.placement`. */
export const placementActions = {
  describe: { capability_id: "placement.describe", version: /* @version action.placement.describe */ 1, operation: "query", action: { ...read,
    title: "对象放在哪里", description: "按对象身份说明它现在存放在哪里、谁能看到、关联了哪些工作、能否移动或复制，以及在哪里打开；移动过的对象按新位置说明。不修改数据。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA }), output_schema: description } } as ActionDefinition<{ object: PlacedObject }, PlacementDescription>,
  spaces: { capability_id: "placement.spaces", version: /* @version action.placement.spaces */ 1, operation: "query", action: { ...read,
    title: "可以放的位置", description: "列出个人空间和全部项目，供移动、复制或「用于项目」时选择去处。",
    input_schema: object({}), output_schema: object({ spaces: { type: "array", items: object({ project_id: projectRef, title: { type: "string" }, kind: { enum: ["personal", "project"] } }) } }) } } as ActionDefinition<Record<string, never>, { spaces: PlacementSpaceView[] }>,
  related: { capability_id: "placement.related", version: /* @version action.placement.related */ 1, operation: "query", action: { ...read,
    title: "用于这个项目的资料", description: "列出从个人空间或其他项目用于这个项目的对象，以及它们现在是否还能打开。",
    input_schema: object({ project_id: projectRef }), output_schema: object({ items: { type: "array", items: related } }) } } as ActionDefinition<{ project_id: string }, { items: PlacementRelatedItem[] }>,
  locate: { capability_id: "placement.locate", version: /* @version action.placement.locate */ 1, operation: "query", action: { ...read,
    title: "对象现在在哪里", description: "按对象身份返回它当前所在的位置；对象被移动过时返回新位置。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA }), output_schema: object({ object: PLACED_OBJECT_SCHEMA, moved: { type: "boolean" } }) } } as ActionDefinition<{ object: PlacedObject }, { object: PlacedObject; moved: boolean }>,
  link: { capability_id: "placement.link", version: /* @version action.placement.link */ 1, operation: "command", action: { ...write,
    title: "用于项目", description: "把一个对象关联到项目：项目主页列出它，你在项目里能打开；它仍在原位置，项目里的助理和 Runtime 读不到正文。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA, project_id: projectRef }), output_schema: object({ key: { type: "string" } }) } } as ActionDefinition<{ object: PlacedObject; project_id: string }, { key: string }>,
  unlink: { capability_id: "placement.unlink", version: /* @version action.placement.unlink */ 1, operation: "command", action: { ...write,
    title: "移除关联", description: "去掉一条由系统记录的关联；不删除对象，不影响复制品与固定版本。",
    input_schema: object({ key: { type: "string", minLength: 1, maxLength: 600 } }), output_schema: object({ removed: { type: "boolean" } }) } } as ActionDefinition<{ key: string }, { removed: boolean }>,
  move: { capability_id: "placement.move", version: /* @version action.placement.move */ 1, operation: "command", action: { ...write,
    title: "移到另一个位置", description: "把对象移到个人空间或另一个项目；同一份内容，关联与引用继续有效，访问范围随新位置改变。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA, to_project_id: projectRef }), output_schema: moved } } as ActionDefinition<{ object: PlacedObject; to_project_id: string }, PlacementMoveResponse>,
  copy: { capability_id: "placement.copy", version: /* @version action.placement.copy */ 1, operation: "command", action: { ...write,
    title: "复制到另一个位置", description: "在选定的位置得到一份独立的副本，并记下“复制自”；同一请求重试不会多出一份。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA, to_project_id: projectRef, request_id: id }), output_schema: moved } } as ActionDefinition<{ object: PlacedObject; to_project_id: string; request_id: string }, PlacementMoveResponse>,
  convert: { capability_id: "placement.convert", version: /* @version action.placement.convert */ 1, operation: "command", action: { ...write,
    title: "转成另一种内容", description: "把对象的内容交给另一个插件做成新对象（如转成文档、建成一个可挂接的对象、存成数据表），并记下来源；原对象不变。",
    input_schema: object({ source: PLACED_OBJECT_SCHEMA, to: { anyOf: [object({ station: { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" } }), object({ attach_kind: kindSchema })] },
      to_project_id: projectRef, request_id: id, payload: object({ title: { type: "string", maxLength: 200 }, body: { type: "string", maxLength: 400000 }, url: nullable({ type: "string", maxLength: 1000 }) }, ["title", "body"]) }, ["source", "to", "to_project_id", "request_id"]),
    output_schema: object({ object: PLACED_OBJECT_SCHEMA, title: { type: "string" }, location, open, noun: { type: "string" } }, ["object", "title", "location", "open"]) } } as ActionDefinition<PlacementConvertRequest, PlacementConvertResponse>,
};

/**
 * The targets of one 「挂到…」 relation in a location for one object: their subject kind, the noun their owner gives it, and the ones it
 * offers (the ones the object is attached to now are `current`).
 */
export interface PlacementAttachKindView {
  kind: string; noun: string;
  /** The owner's view that lists what is attached to a target of this kind (`PlacementRelationTarget.open_view`). */
  open_view?: string;
  targets: { id: string; title: string; current: boolean }[];
}
export interface PlacementCreateRequest { station: string; project_id: string; title?: string; attach_to?: { kind: string; id: string } | null; request_id: string }

/** 「挂到…」 and creating straight onto a target: the target's owner keeps the binding; this service only asks it. */
export const placementAttachActions = {
  targets: { capability_id: "placement.attach.targets", version: /* @version action.placement.attach.targets */ 1, operation: "query", action: { ...read,
    title: "可以挂到哪里", description: "列出一个位置里可以把这个对象挂上去的对象（如还在进行的目标），按种类分组，已挂上的标明，供选择。",
    input_schema: object({ project_id: projectRef, object: PLACED_OBJECT_SCHEMA }), output_schema: object({ kinds: { type: "array", items: object({ kind: { type: "string" }, noun: { type: "string" }, open_view: { type: "string" },
      targets: { type: "array", items: object({ id: { type: "string" }, title: { type: "string" }, current: { type: "boolean" } }) } }) } }) } } as ActionDefinition<{ project_id: string; object: PlacedObject }, { kinds: PlacementAttachKindView[] }>,
  attach: { capability_id: "placement.attach", version: /* @version action.placement.attach */ 1, operation: "command", action: { ...write,
    title: "挂到…", description: "把对象挂到另一个对象上（由对方的主人记录）；不复制、不移动。对象在别处时，同时用于对方所在的项目。给了读到的版本（read_revision）时，对方的主人可以记下它，以后能看出原文改没改；mode 为 fixed 时按固定版本记下输入。",
    input_schema: object({ object: PLACED_OBJECT_SCHEMA, project_id: projectRef, target: object({ kind: kindSchema, id }), read_revision: { type: "string", minLength: 1, maxLength: 200 }, mode: { enum: ["live", "fixed"] }, material_ref: MATERIAL_REF_SCHEMA }, ["object", "project_id", "target"]),
    output_schema: object({ key: { type: "string" } }) } } as ActionDefinition<{ object: PlacedObject; project_id: string; target: { kind: string; id: string }; read_revision?: string; mode?: "live" | "fixed"; material_ref?: MaterialRef }, { key: string }>,
  create: { capability_id: "placement.create", version: /* @version action.placement.create */ 1, operation: "command", action: { ...write,
    title: "在这里新建", description: "在指定位置新建一份内容（文档、演示稿、数据表…），需要时同时挂到一个对象上。",
    input_schema: object({ station: { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" }, project_id: projectRef, title: { type: "string", maxLength: 200 },
      attach_to: nullable(object({ kind: kindSchema, id })), request_id: id }, ["station", "project_id", "request_id"]),
    output_schema: object({ object: PLACED_OBJECT_SCHEMA, title: { type: "string" }, location, open, attached_key: { type: ["string", "null"] } }) } } as ActionDefinition<PlacementCreateRequest, PlacementConvertResponse & { attached_key: string | null }>,
};

export type PlacementSubject = ActionSubject;

/** Frozen, owner-interpreted saved data. No execution or storage handle is a transferable asset. */
export interface ProjectCopyAsset { readonly key:string; readonly value:unknown }
export interface ProjectCopyReference {readonly kind:string;readonly id:string;readonly projectId:string|null}
/** Generated by the trusted copy receipt before any import; repeated lookup returns the same new identity. */
export interface ProjectCopyIdentity {
 readonly sourceSpaceId:string;readonly targetSpaceId:string;
 readonly sourceProjectId:string|null;readonly targetProjectId:string|null;readonly targetTitle:string;
 id(kind:string,sourceId:string,sourceProjectId?:string|null):string;
 project(sourceProjectId:string|null):string|null;
}
/** Existing owner data API, separate from personal-sync admission. Forking cannot execute or import. */
export interface ProjectCopyOwner {
 /** Materialize immutable assets before the synchronous, create-once target transaction. */
 prepare?(asset:ProjectCopyAsset):Promise<void>;
 /** Kinds use the bound owner ID plus a colon; a Runtime cannot claim another publisher’s owner namespace. */
 readonly kinds:readonly string[];
 read(reference:ProjectCopyReference):ProjectCopyAsset|null;
 snapshot(projectId:string):readonly ProjectCopyAsset[];
 references(asset:ProjectCopyAsset):readonly ProjectCopyReference[];
 fork(asset:ProjectCopyAsset,identity:ProjectCopyIdentity):ProjectCopyAsset;
 /** Create once, or verify an identical prior result. Never overwrite an independently changed target. */
 apply(asset:ProjectCopyAsset):void;
}
