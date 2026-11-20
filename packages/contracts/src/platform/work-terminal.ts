import { inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ActionDefinition, ActionSchema } from "./actions.js";
import { UI_SUBJECT_CONTEXT_LIMIT, UI_SUBJECT_CONTEXT_PLUGINS, type SubjectContextAnswer } from "./plugin-manifest.js";
import type { PluginTerminalProgram } from "./plugin-host-services.js";

/** The Host's own provider for object work terminals (batch 44 item 4, PEQ-17). */
export const WORK_TERMINAL_PROVIDER_ID = "system.work-terminal";
/** Where the person's page lists, opens, closes and prompts an object's work terminals, under the project's route prefix. */
export const WORK_TERMINAL_PATH = "/api/work-terminals";
export const WORK_TERMINAL_READ_PERMISSION = "work_terminals:read";
export const WORK_TERMINAL_WRITE_PERMISSION = "work_terminals:write";
export const WORK_TERMINAL_PERMISSIONS: readonly string[] = [WORK_TERMINAL_READ_PERMISSION, WORK_TERMINAL_WRITE_PERMISSION];

export const WORK_TERMINAL_PROMPT_INPUT_TYPE = /* @version type.molis.work-terminal.prompt.query "molis.work-terminal.prompt.query.v{version}" */ "molis.work-terminal.prompt.query.v1";
export const WORK_TERMINAL_PROMPT_OUTPUT_TYPE = /* @version type.molis.work-terminal.prompt.view "molis.work-terminal.prompt.view.v{version}" */ "molis.work-terminal.prompt.view.v1";

/**
 * One kind of object a plugin lets the person open a platform work terminal on (PEQ-17). The plugin needs no terminal,
 * workspace or project-guidance permission of its own: it only names the object kind and its own read-only user query
 * (`defineWorkTerminalPromptAction`) that says whether the object exists, whether it is read-only and what trusted
 * instruction advances it. The platform owns the terminal process, workspace folder, guidance prefix and untrusted context.
 */
export interface WorkTerminalObjectDeclaration {
  readonly subject_kind: string;
  readonly prompt_action: string;
}

export interface WorkTerminalPromptInput {
  readonly subject_id: string;
  readonly onboarding?: boolean;
}

export interface WorkTerminalPromptView {
  readonly subject: ActionSubject;
  readonly title: string;
  readonly read_only: boolean;
  readonly read_only_reason?: string;
  /** The trusted instruction when no external untrusted context is bound. */
  readonly instruction?: string;
  /** The trusted instruction when untrusted external source context is bound (names the object by id alone, never external titles). */
  readonly instruction_with_untrusted_source?: string;
  /** Confirmed current facts of the object, appended inside the trusted current-work block. */
  readonly current_facts?: string;
}

export interface WorkTerminalPanelRow {
  readonly key: string;
  readonly panel_id: string;
  readonly title: string;
  readonly runtime: string;
  readonly program: PluginTerminalProgram;
  readonly running: boolean;
  readonly created_at: string;
}

export interface WorkTerminalListInput {
  readonly plugin_id: string;
  readonly subject: ActionSubject;
}
export interface WorkTerminalListResult {
  readonly panels: WorkTerminalPanelRow[];
  readonly read_only: boolean;
  readonly read_only_reason?: string;
}
export interface WorkTerminalOpenInput {
  readonly plugin_id: string;
  readonly subject: ActionSubject;
  readonly key?: string;
  readonly runtime?: string;
  readonly resume_session_id?: string;
  readonly command?: string;
  readonly args?: string[];
  readonly workspace_id?: string;
}
export interface WorkTerminalOpenResult {
  readonly panel_id: string;
  readonly key: string;
  readonly started: boolean;
}
export interface WorkTerminalCloseInput {
  readonly plugin_id: string;
  readonly subject: ActionSubject;
  readonly key: string;
}
export interface WorkTerminalPromptActionInput {
  readonly plugin_id: string;
  readonly subject: ActionSubject;
  readonly onboarding?: boolean;
  readonly source_contexts?: SubjectContextAnswer["contexts"];
}
export interface WorkTerminalPromptActionResult {
  readonly plugin_id: string;
  readonly subject: ActionSubject;
  readonly title: string;
  readonly prompt: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const text = { type: "string", maxLength: 8_000 } as const;
const keySchema = { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } as const;
const sessionSchema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" } as const;
const pluginIdSchema = { type: "string", minLength: 1, maxLength: 120 } as const;
const programSchema: ActionSchema = {
  anyOf: [
    { type: "object", properties: { runtime: { type: "string", minLength: 1, maxLength: 120 } }, required: ["runtime"], additionalProperties: false },
    { type: "object", properties: { command: { type: "string", minLength: 1, maxLength: 4096 }, args: { type: "array", maxItems: 32, items: { type: "string", maxLength: 4096 } } }, required: ["command", "args"], additionalProperties: false },
  ],
};
const panelSchema: ActionSchema = {
  type: "object",
  properties: { key: keySchema, panel_id: id, title: { type: "string", maxLength: 200 }, runtime: { type: "string", maxLength: 120 }, program: programSchema, running: { type: "boolean" }, created_at: id },
  required: ["key", "panel_id", "title", "runtime", "program", "running", "created_at"],
  additionalProperties: false,
};
const sourceContextsSchema = {
  type: "array",
  maxItems: UI_SUBJECT_CONTEXT_PLUGINS,
  items: {
    type: "object",
    properties: { plugin_id: pluginIdSchema, source_context: { type: "string", minLength: 1, maxLength: UI_SUBJECT_CONTEXT_LIMIT } },
    required: ["plugin_id", "source_context"],
    additionalProperties: false,
  },
} as const;

export const WORK_TERMINAL_PROMPT_SCHEMAS = {
  input: inputSchemaFor<WorkTerminalPromptInput>()({
    type: "object",
    properties: { subject_id: id, onboarding: { type: "boolean" } },
    required: ["subject_id"],
    additionalProperties: false,
  } as const),
  output: {
    type: "object",
    properties: {
      subject: ACTION_SUBJECT_SCHEMA,
      title: { type: "string", maxLength: 500 },
      read_only: { type: "boolean" },
      read_only_reason: { type: "string", maxLength: 500 },
      instruction: text,
      instruction_with_untrusted_source: text,
      current_facts: text,
    },
    required: ["subject", "title", "read_only"],
    additionalProperties: false,
  } as ActionSchema,
} as const;

/** A plugin's own read-only user query describing one object kind for the platform's work terminal. */
export function defineWorkTerminalPromptAction(
  capability_id: string, version: number, kind: string, title: string, permissions: string[],
): ActionDefinition<WorkTerminalPromptInput, WorkTerminalPromptView> {
  return { capability_id, version, operation: "query", action: {
    title, description: "读取本插件单个对象的只读状态与推进指令，供平台工作终端检查和生成提示词。",
    kind: "query", scope: "project", audiences: ["user"], permissions, subject_kinds: [kind],
    input_type: WORK_TERMINAL_PROMPT_INPUT_TYPE, output_type: WORK_TERMINAL_PROMPT_OUTPUT_TYPE,
    input_schema: WORK_TERMINAL_PROMPT_SCHEMAS.input, output_schema: WORK_TERMINAL_PROMPT_SCHEMAS.output,
  } };
}

/** Whether an action is a work-terminal prompt reader, by its types. */
export const isWorkTerminalPromptAction = (action: { input_type?: string; output_type?: string }): boolean =>
  action.input_type === WORK_TERMINAL_PROMPT_INPUT_TYPE && action.output_type === WORK_TERMINAL_PROMPT_OUTPUT_TYPE;

function platformTerminalAction<Input, Output>(
  capability_id: string, version: number, operation: "query" | "command", title: string, description: string,
  permissions: string[], input_schema: ActionSchema, output_schema: ActionSchema,
): ActionDefinition<Input, Output> {
  return { capability_id, version, operation, action: {
    title, description, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user"],
    ...(operation === "command" ? { authorship: "session" as const } : {}), permissions, subject_kinds: [], input_schema, output_schema,
  } };
}

/** The platform's object work-terminal actions: the person's page only, working for any plugin that declares `work_terminals`. */
export const workTerminalActions = {
  list: platformTerminalAction<WorkTerminalListInput, WorkTerminalListResult>(
    "work_terminals.list", /* @version action.work_terminals.list */ 1, "query",
    "读取对象的工作终端", "列出本人在这个对象上打开过的工作终端与它们是否在运行，以及该对象是否只读",
    [WORK_TERMINAL_READ_PERMISSION],
    inputSchemaFor<WorkTerminalListInput>()({
      type: "object", properties: { plugin_id: pluginIdSchema, subject: ACTION_SUBJECT_SCHEMA },
      required: ["plugin_id", "subject"], additionalProperties: false,
    }),
    { type: "object", properties: { panels: { type: "array", items: panelSchema }, read_only: { type: "boolean" }, read_only_reason: { type: "string", maxLength: 500 } },
      required: ["panels", "read_only"], additionalProperties: false },
  ),
  open: platformTerminalAction<WorkTerminalOpenInput, WorkTerminalOpenResult>(
    "work_terminals.open", /* @version action.work_terminals.open */ 1, "command",
    "打开对象的工作终端", "在项目已关联的工作目录里为已声明的对象打开终端：runtime 是平台认识的编程 Agent（可用 resume_session_id 接着原会话），或给出 command 与参数；同一 key 在运行时直接接上，停了就用原程序重开",
    [WORK_TERMINAL_WRITE_PERMISSION],
    inputSchemaFor<WorkTerminalOpenInput>()({
      type: "object",
      properties: {
        plugin_id: pluginIdSchema, subject: ACTION_SUBJECT_SCHEMA, key: keySchema,
        runtime: id, resume_session_id: sessionSchema, command: { type: "string", minLength: 1, maxLength: 4096 },
        args: { type: "array", maxItems: 32, items: { type: "string", maxLength: 4096 } }, workspace_id: id,
      },
      required: ["plugin_id", "subject"], additionalProperties: false,
    }),
    { type: "object", properties: { panel_id: id, key: keySchema, started: { type: "boolean" } },
      required: ["panel_id", "key", "started"], additionalProperties: false },
  ),
  close: platformTerminalAction<WorkTerminalCloseInput, { closed: true }>(
    "work_terminals.close", /* @version action.work_terminals.close */ 1, "command",
    "关闭对象的工作终端", "结束这个对象上的一个工作终端并忘掉它",
    [WORK_TERMINAL_WRITE_PERMISSION],
    inputSchemaFor<WorkTerminalCloseInput>()({
      type: "object", properties: { plugin_id: pluginIdSchema, subject: ACTION_SUBJECT_SCHEMA, key: keySchema },
      required: ["plugin_id", "subject", "key"], additionalProperties: false,
    }),
    { type: "object", properties: { closed: { const: true } }, required: ["closed"], additionalProperties: false },
  ),
  prompt: platformTerminalAction<WorkTerminalPromptActionInput, WorkTerminalPromptActionResult>(
    "work_terminals.prompt", /* @version action.work_terminals.prompt */ 1, "query",
    "读取工作终端的推进提示词", "结合对象主人的推进指令与平台项目指引生成提示词；页面读到的关联原文只作为不可信数据附上",
    [WORK_TERMINAL_READ_PERMISSION],
    inputSchemaFor<WorkTerminalPromptActionInput>()({
      type: "object",
      properties: { plugin_id: pluginIdSchema, subject: ACTION_SUBJECT_SCHEMA, onboarding: { type: "boolean" }, source_contexts: sourceContextsSchema },
      required: ["plugin_id", "subject"], additionalProperties: false,
    }),
    { type: "object", properties: { plugin_id: pluginIdSchema, subject: ACTION_SUBJECT_SCHEMA, title: { type: "string", maxLength: 500 }, prompt: { type: "string" } },
      required: ["plugin_id", "subject", "title", "prompt"], additionalProperties: false },
  ),
} as const;
export const WORK_TERMINAL_ACTIONS: readonly ActionDefinition[] = Object.values(workTerminalActions);
