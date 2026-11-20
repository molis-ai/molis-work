import { defineErrorCodes, type ActionDefinition, type ActionSchema } from "../platform/actions.js";

/*
 * A project's confirmed guidance (specs/plugin-equal-standing/contract-design.md §9, batch 44 item 2): what the person told this project
 * to keep in mind, which every Agent Run, Assistant turn and connected client starts with. The platform's project service keeps it
 * (`modules/projects`), so it holds whichever plugins are installed; until batch 44 Goals kept it, with the same shapes.
 */

export const PROJECT_GUIDANCE_KINDS = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"] as const;
export type ProjectGuidanceKind = (typeof PROJECT_GUIDANCE_KINDS)[number];
/** One entry, in characters (code points). */
export const PROJECT_GUIDANCE_ENTRY_MAX_CHARS = 4_000;
/** All active entries of a project together, in characters. */
export const PROJECT_GUIDANCE_TOTAL_MAX_CHARS = 32_000;

export interface ProjectGuidanceEntryRecord {
  guidance_id: string;
  project_id: string;
  position: number;
  revision: number;
  active: boolean;
  kind: ProjectGuidanceKind;
  content: string;
  content_hash: string;
  source_refs: string[];
  created_by: string;
  confirmation_summary: string;
  reason: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export type ProjectGuidanceChangeKind = "created" | "edited" | "deactivated" | "restored";

export interface ProjectGuidanceRevisionRecord {
  revision_id: string;
  guidance_id: string;
  project_id: string;
  revision: number;
  kind: ProjectGuidanceKind;
  content: string;
  content_hash: string;
  source_refs: string[];
  active: boolean;
  changed_by: string;
  change_kind: ProjectGuidanceChangeKind;
  confirmation_summary: string;
  reason: string;
  created_at: string;
}

/** The project's guidance: active entries in order, the inactive ones, every revision, and the text a Run starts with. */
export interface ProjectGuidanceView {
  entries: ProjectGuidanceEntryRecord[];
  inactive_entries: ProjectGuidanceEntryRecord[];
  revisions: ProjectGuidanceRevisionRecord[];
  virtual_document: string;
  runtime_prompt_prefix: string;
}

/** What a write carries besides its change: the person's confirmation, why it is kept, and the key a retry repeats. */
interface ProjectGuidanceWrite {
  reason: string;
  confirmation_summary: string;
  /** The person saw the exact kind and text and agreed; a write without it is refused. */
  user_confirmed: boolean;
  idempotency_key: string;
}

export interface AddProjectGuidanceInput extends ProjectGuidanceWrite {
  kind: ProjectGuidanceKind;
  content: string;
  source_refs?: string[];
}

export interface AddProjectGuidanceResult {
  entry: ProjectGuidanceEntryRecord;
  /** False when an active entry of the same kind and text was there already: that one is returned. */
  created: boolean;
  observed_event_cursor: number;
  replayed: boolean;
}

export interface UpdateProjectGuidanceInput extends ProjectGuidanceWrite {
  guidance_id: string;
  /** `edit` needs `kind` and `content`. */
  action: "edit" | "deactivate" | "restore";
  kind?: ProjectGuidanceKind;
  content?: string;
  source_refs?: string[];
}

export interface UpdateProjectGuidanceResult {
  entry: ProjectGuidanceEntryRecord;
  revision: ProjectGuidanceRevisionRecord;
  observed_event_cursor: number;
  replayed: boolean;
}

/** The provider the Host registers the guidance actions under. */
export const PROJECT_GUIDANCE_PROVIDER_ID = "system.project-guidance";
/**
 * What reading asks for. The Host's own reads (a Run's or an Assistant turn's project layer, the settings page) carry it; a connected client
 * reads only once the person granted it, as when Goals kept the guidance (user 2026-11-18: a permission-free system action would be open
 * to every MCP client by default).
 */
export const PROJECT_GUIDANCE_READ_PERMISSION = "projects:guidance-read";
/** What a write asks for. */
export const PROJECT_GUIDANCE_WRITE_PERMISSION = "projects:guidance";

/** The same refusals Goals gave, under the platform's name (`goals.project_guidance.*`, `goals.storage.record_unreadable` → `projects.guidance.*`). */
export const projectGuidanceErrors = defineErrorCodes("projects.guidance", {
  action_invalid: "invalid",
  already_active: "invalid",
  already_inactive: "invalid",
  duplicate: "invalid",
  entry_too_large: "invalid",
  inactive: "invalid",
  invalid: "invalid",
  kind_invalid: "invalid",
  no_changes: "invalid",
  not_found: "invalid",
  total_too_large: "invalid",
  user_confirmation_required: "invalid",
  idempotency_key_reused: "invalid",
  /** A stored row that cannot be read back (broken JSON): the read stops, pointing at the row, rather than reading it as empty. */
  record_unreadable: "internal",
});

const text = { type: "string" } as const;
const identifier = { type: "string", minLength: 1 } as const;
const count = { type: "integer", minimum: 0 } as const;
const boolean = { type: "boolean" } as const;
const object = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): ActionSchema =>
  ({ type: "object", properties, required: [...required], additionalProperties: false });
const strings = { type: "array", items: text } as const;
const kind = { enum: [...PROJECT_GUIDANCE_KINDS] } as const;
const common = { guidance_id: text, project_id: text, revision: count, active: boolean, kind, content: text, content_hash: text,
  source_refs: strings, confirmation_summary: text, reason: text, created_at: text };
export const PROJECT_GUIDANCE_ENTRY_SCHEMA = object({ ...common, position: count, created_by: text, updated_by: text, updated_at: text });
export const PROJECT_GUIDANCE_REVISION_SCHEMA = object({ ...common, revision_id: text, changed_by: text,
  change_kind: { enum: ["created", "edited", "deactivated", "restored"] } });
const write = { reason: identifier, confirmation_summary: identifier, user_confirmed: boolean, idempotency_key: identifier };
const link = { label: "查看项目说明", href_template: "/projects/{project_id}/settings/guidance" };

/** Read, add and change a project's guidance. The project and who acts come from the call context, never from the input. */
export const projectGuidanceActions = {
  read: {
    capability_id: "projects.guidance.read", version: /* @version action.projects.guidance.read */ 1, operation: "query",
    action: { title: "读取项目长期说明", description: "读取已确认的长期说明、停用项、完整修订和当前 Runtime Prompt 前缀", kind: "query", scope: "project", effect: "read",
      audiences: ["user", "agent", "mcp", "workflow", "plugin"], permissions: [PROJECT_GUIDANCE_READ_PERMISSION], subject_kinds: ["project"],
      input_schema: object({}), output_schema: object({ entries: { type: "array", items: PROJECT_GUIDANCE_ENTRY_SCHEMA },
        inactive_entries: { type: "array", items: PROJECT_GUIDANCE_ENTRY_SCHEMA }, revisions: { type: "array", items: PROJECT_GUIDANCE_REVISION_SCHEMA },
        virtual_document: text, runtime_prompt_prefix: text }) },
  } as ActionDefinition<Record<string, never>, ProjectGuidanceView>,
  add: {
    capability_id: "projects.guidance.add", version: /* @version action.projects.guidance.add */ 1, operation: "command",
    action: { title: "新增项目长期说明", description: "先向用户展示精确分类和原文，说明长期保存原因并获得明确同意，再保存说明。同类同文的已有说明直接返回；重试保留相同 idempotency_key",
      kind: "operation", scope: "project", effect: "write", audiences: ["user", "agent", "mcp", "workflow"], authorship: "session", permissions: [PROJECT_GUIDANCE_WRITE_PERMISSION],
      subject_kinds: ["project"],
      input_schema: object({ ...write, kind, content: identifier, source_refs: strings }, [...Object.keys(write), "kind", "content"]),
      output_schema: object({ entry: PROJECT_GUIDANCE_ENTRY_SCHEMA, created: boolean, observed_event_cursor: count, replayed: boolean }),
      result_view: { summary: "项目长期说明已保存", text_pointer: "/entry/content", link } },
  } as ActionDefinition<AddProjectGuidanceInput, AddProjectGuidanceResult>,
  update: {
    capability_id: "projects.guidance.update", version: /* @version action.projects.guidance.update */ 1, operation: "command",
    action: { title: "修改项目长期说明", description: "用户明确同意精确变更后编辑、停用或恢复说明，保留修订历史。edit 必须提供 kind 和 content；重试保留原幂等键",
      kind: "operation", scope: "project", effect: "write", audiences: ["user", "agent", "mcp", "workflow"], authorship: "session", permissions: [PROJECT_GUIDANCE_WRITE_PERMISSION],
      subject_kinds: ["project"],
      input_schema: object({ ...write, guidance_id: identifier, action: { enum: ["edit", "deactivate", "restore"] }, kind, content: text, source_refs: strings },
        [...Object.keys(write), "guidance_id", "action"]),
      output_schema: object({ entry: PROJECT_GUIDANCE_ENTRY_SCHEMA, revision: PROJECT_GUIDANCE_REVISION_SCHEMA, observed_event_cursor: count, replayed: boolean }),
      result_view: { summary: "项目长期说明变更已保存", text_pointer: "/entry/content", link } },
  } as ActionDefinition<UpdateProjectGuidanceInput, UpdateProjectGuidanceResult>,
} as const;
