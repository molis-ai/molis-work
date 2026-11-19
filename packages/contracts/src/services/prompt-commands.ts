import type { ActionDefinition } from "../platform/actions.js";

/**
 * Prompt commands (Coding A2, specs/coding-plugin/next-requirements.md): a command is a Markdown file whose text becomes the task, with
 * `$ARGUMENTS` replaced, as written, by what the person typed after it. A command is only prompt text: no permission, tool or model comes
 * with it, whatever its front matter says. A project keeps its own in `.molis/commands` (and `.claude/commands` is read too); the
 * person's own, for every project, are in the same two folders under their home directory. The Host reads both, with one walk: the
 * project's from one of its folders (`commands.project.list@1`), the person's (`commands.personal.list@1`).
 * The file is read by `readPromptCommand` in the plugin SDK, one reading for every caller.
 */

/** A plugin that lists the person's own commands declares this; the project's are read with `workspace:read` like the rest of its folder. */
export const PROMPT_COMMANDS_READ_PERMISSION = "commands:read";
/** Where commands are, in a project's folder and in the person's home directory: Molis's own first, so its command wins a clash. */
export const PROMPT_COMMAND_LOCATIONS = [".molis/commands", ".claude/commands"] as const;
export type PromptCommandLocation = (typeof PROMPT_COMMAND_LOCATIONS)[number];
/** At most this many files are read from one folder, each at most this long; a folder one level down names its commands `folder:name`. */
export const PROMPT_COMMAND_LIMITS = { files: 100, bytes: 64 * 1024, name: 80 } as const;

/** Why a command file is listed but cannot be used; the page says it in its own words and the others still work. */
export type PromptCommandProblem = "front-matter" | "too-large" | "not-text" | "link" | "unreadable";

interface PromptCommandPlace {
  /** What follows `/`: the file's name without `.md`, `folder:name` one level down. */
  readonly name: string;
  readonly location: PromptCommandLocation;
  /** The file's path under its location, with `/`. */
  readonly path: string;
}
export interface PromptCommand extends PromptCommandPlace {
  /** The front matter's `description`, else the first line of the text, shortened. */
  readonly description: string;
  /** The front matter's `argument-hint`; null when the text names no `$ARGUMENTS` and gives no hint. */
  readonly argument_hint: string | null;
  /** Whether the text says where the arguments go; one that does not gets them after it on a line of their own. */
  readonly takes_arguments: boolean;
  /** The text after the front matter, as written. */
  readonly text: string;
}
export interface PromptCommandUnreadable extends PromptCommandPlace { readonly unreadable: PromptCommandProblem }
export type PromptCommandFile = PromptCommand | PromptCommandUnreadable;

const text = (maxLength: number) => ({ type: "string", maxLength });
const place = { name: text(PROMPT_COMMAND_LIMITS.name), location: { enum: [...PROMPT_COMMAND_LOCATIONS] }, path: text(400) };
const commandFile = { oneOf: [
  { type: "object", required: ["name", "location", "path", "description", "argument_hint", "takes_arguments", "text"], additionalProperties: false,
    properties: { ...place, description: text(400), argument_hint: { type: ["string", "null"], maxLength: 200 }, takes_arguments: { type: "boolean" }, text: text(PROMPT_COMMAND_LIMITS.bytes) } },
  { type: "object", required: ["name", "location", "path", "unreadable"], additionalProperties: false,
    properties: { ...place, unreadable: { enum: ["front-matter", "too-large", "not-text", "link", "unreadable"] } } },
] };

/** The person's own commands on this computer, read by the Host from `~/.molis/commands` and `~/.claude/commands`; only `.md` files, no links. */
export const personalPromptCommandsCapability = {
  capability_id: "commands.personal.list", version: /* @version action.commands.personal.list */ 1, operation: "query",
  action: { title: "我的命令", description: "列出这台电脑上你自己的命令（家目录下 .molis/commands 与 .claude/commands 里的 .md）；只读，命令只是一段提示文字，不带任何权限",
    kind: "query", scope: "project", audiences: ["plugin"], permissions: [PROMPT_COMMANDS_READ_PERMISSION], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", required: ["commands"], additionalProperties: false, properties: { commands: { type: "array", maxItems: PROMPT_COMMAND_LIMITS.files * PROMPT_COMMAND_LOCATIONS.length, items: commandFile } } } },
} as ActionDefinition<Record<string, never>, { commands: PromptCommandFile[] }>;

/** The project's commands in one of its folders, read by the Host in one call; a folder that is not the current project's is refused. */
export const projectPromptCommandsCapability = {
  capability_id: "commands.project.list", version: /* @version action.commands.project.list */ 1, operation: "query",
  action: { title: "项目的命令", description: "列出项目某个已关联工作目录里的命令（.molis/commands 与 .claude/commands 里的 .md）；只读，命令只是一段提示文字，不带任何权限",
    kind: "query", scope: "project", audiences: ["plugin"], permissions: ["workspace:read"], subject_kinds: ["workspace"],
    input_schema: { type: "object", required: ["workspace_id"], properties: { workspace_id: { type: "string", minLength: 1, title: "工作目录" } }, additionalProperties: false },
    output_schema: { type: "object", required: ["commands"], additionalProperties: false, properties: { commands: { type: "array", maxItems: PROMPT_COMMAND_LIMITS.files * PROMPT_COMMAND_LOCATIONS.length, items: commandFile } } } },
} as ActionDefinition<{ workspace_id: string }, { commands: PromptCommandFile[] }>;
