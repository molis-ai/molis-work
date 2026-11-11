import { randomUUID } from "node:crypto";
import { ActionError, bindActionHandler, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_PROMPT_MAX_CHARS, agentDefinitionErrors, PROMPT_OVERRIDES_FILE_MAX_ROWS, type PromptOverridesFile } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { compareChange, type DiffView } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import type { AgentDefinitions } from "./agent-definitions.js";

// The person's prompt edits taken out and brought back (specs/capability-pack/contract-design.md §4.9): a file of their own data, never a
// package. Bringing it back is a preview, then a confirmation of the rows they pick; each row is saved the way the 「提示词」 page saves.

type Status = "applicable" | "base_mismatch" | "prompt_missing" | "same";
interface PreviewRow { row_id: string; owner_id: string; prompt_id: string; title: string; base_version: number; default_version: number | null; status: Status; diff: DiffView }
interface Held { actor_id: string; project_id: string | null; expires: number; rows: Map<string, { key: string; body: string; base_version: number; revision: number | null; status: Status }> }
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const FORMAT_VERSION = /* @version format.agent-definitions.prompt-overrides */ 1;
const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const file = { type: "object", additionalProperties: false, required: ["format", "format_version", "exported_at", "overrides"], properties: {
  format: { const: "molis.prompt-overrides" }, format_version: { const: FORMAT_VERSION }, exported_at: { type: "string", maxLength: 64 },
  overrides: { type: "array", maxItems: PROMPT_OVERRIDES_FILE_MAX_ROWS, items: { type: "object", additionalProperties: false, required: ["owner_id", "prompt_id", "title", "base_version", "body"], properties: {
    owner_id: id, prompt_id: id, title: { type: "string", maxLength: 200 }, base_version: { type: "integer", minimum: 1 }, body: { type: "string", minLength: 1, maxLength: AGENT_PROMPT_MAX_CHARS } } } } } } as const;
const meta = { audiences: ["user"], subject_kinds: [], scope: "project", permissions: [] } as const;

export const promptOverrideActions = {
  export: { capability_id: "agent-definitions.prompt-overrides.export", version: /* @version action.agent-definitions.prompt-overrides.export */ 1, operation: "query",
    action: { ...meta, kind: "query", effect: "read", title: "导出提示词改写", description: "把本人改过的提示词写成一份文件：每条是哪个主人的哪段提示词、基于默认的第几版、改后的正文。不给 keys 就是全部改过的。只给本人。",
      input_schema: { type: "object", additionalProperties: false, properties: { keys: { type: "array", maxItems: PROMPT_OVERRIDES_FILE_MAX_ROWS, items: { type: "string", minLength: 1, maxLength: 420 } } } },
      output_schema: file } } as ActionDefinition<{ keys?: string[] }, PromptOverridesFile>,
  preview: { capability_id: "agent-definitions.prompt-overrides.import.preview", version: /* @version action.agent-definitions.prompt-overrides.import.preview */ 1, operation: "command",
    action: { ...meta, kind: "operation", effect: "read", title: "预览导回提示词改写", description: "读一份提示词改写文件，逐条和现在的提示词比：能套用、基于的默认版本已变、提示词已不在、和现在一样；给出差异。不写任何东西；预览只给发起的本人在这个项目里用一次。",
      input_schema: { type: "object", additionalProperties: false, required: ["file"], properties: { file } },
      output_schema: { type: "object", additionalProperties: false, required: ["preview_id", "rows"], properties: { preview_id: id, rows: { type: "array", maxItems: PROMPT_OVERRIDES_FILE_MAX_ROWS, items: {
        type: "object", additionalProperties: false, required: ["row_id", "owner_id", "prompt_id", "title", "base_version", "default_version", "status", "diff"], properties: {
          row_id: id, owner_id: id, prompt_id: id, title: { type: "string", maxLength: 200 }, base_version: { type: "integer" }, default_version: { type: ["integer", "null"] },
          status: { enum: ["applicable", "base_mismatch", "prompt_missing", "same"] }, diff: { type: "object" } } } } } } } } as ActionDefinition<{ file: PromptOverridesFile }, { preview_id: string; rows: PreviewRow[] }>,
  confirm: { capability_id: "agent-definitions.prompt-overrides.import.confirm", version: /* @version action.agent-definitions.prompt-overrides.import.confirm */ 1, operation: "command",
    action: { ...meta, kind: "operation", effect: "write", title: "确认导回提示词改写", description: "把一次预览里选中的、能套用的行存成本人的改写，与在「提示词」编辑页保存同一条路；其余行不套用。只接受本人在界面上的操作。",
      input_schema: { type: "object", additionalProperties: false, required: ["preview_id", "row_ids"], properties: { preview_id: id, row_ids: { type: "array", minItems: 1, maxItems: PROMPT_OVERRIDES_FILE_MAX_ROWS, items: id } } },
      output_schema: { type: "object", additionalProperties: false, required: ["applied", "skipped"], properties: {
        applied: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "revision"], properties: { key: { type: "string" }, revision: { type: "integer" } } } },
        skipped: { type: "array", items: { type: "object", additionalProperties: false, required: ["row_id", "reason"], properties: { row_id: id, reason: id } } } } } } } as ActionDefinition<
    { preview_id: string; row_ids: string[] }, { applied: Array<{ key: string; revision: number }>; skipped: Array<{ row_id: string; reason: string }> }>,
};

/** The three actions over one register; previews are held in memory, for the person and project that made them, used once. */
export function promptOverrideHandlers(definitions: () => AgentDefinitions, now = () => Date.now()): ActionHandlerBinding[] {
  const held = new Map<string, Held>();
  const side = (key: string, version: number) => ({ workspace_id: "prompts", workspace_name: "提示词", path: key, source_plugin_id: key.slice(0, key.indexOf("/")), content_version: version });
  return [
    bindActionHandler(promptOverrideActions.export, input => {
      const wanted = input.keys && new Set(input.keys);
      return { format: "molis.prompt-overrides", format_version: FORMAT_VERSION, exported_at: new Date(now()).toISOString(),
        overrides: definitions().prompts().filter(view => view.user && (!wanted || wanted.has(view.key))).slice(0, PROMPT_OVERRIDES_FILE_MAX_ROWS)
          .map(view => ({ owner_id: view.owner_id, prompt_id: view.prompt_id, title: view.title.slice(0, 200), base_version: view.user!.base_version, body: view.body })) };
    }),
    bindActionHandler(promptOverrideActions.preview, (input, caller) => {
      for (const [key, value] of held) if (value.expires < now()) held.delete(key);
      const register = definitions(), rows: PreviewRow[] = [], kept: Held["rows"] = new Map();
      for (const override of input.file.overrides) {
        const key = `${override.owner_id}/${override.prompt_id}`, row_id = randomUUID();
        let view: ReturnType<AgentDefinitions["prompt"]> | undefined;
        try { view = register.prompt(key); } catch { view = undefined; }
        const status: Status = !view ? "prompt_missing" : view.body === override.body ? "same" : view.default_version !== override.base_version ? "base_mismatch" : "applicable";
        rows.push({ row_id, owner_id: override.owner_id, prompt_id: override.prompt_id, title: (view?.title ?? override.title).slice(0, 200), base_version: override.base_version,
          default_version: view?.default_version ?? null, status,
          diff: compareChange(null, { before: side(key, view?.default_version ?? override.base_version), after: side(key, override.base_version) }, { before: view?.body ?? "", after: override.body, created: !view }) });
        kept.set(row_id, { key, body: override.body, base_version: override.base_version, revision: view?.user?.revision ?? null, status });
      }
      const preview_id = randomUUID();
      held.set(preview_id, { actor_id: caller.actor_id, project_id: caller.project_id ?? null, expires: now() + PREVIEW_TTL_MS, rows: kept });
      return { preview_id, rows };
    }),
    bindActionHandler(promptOverrideActions.confirm, async (input, caller) => {
      if (!caller.user_action) throw new ActionError("actions.forbidden", "导回提示词改写只接受本人在界面上的操作");
      const preview = held.get(input.preview_id);
      if (!preview || preview.expires < now() || preview.actor_id !== caller.actor_id || preview.project_id !== (caller.project_id ?? null))
        throw agentDefinitionErrors.overrides_preview_unknown("这次导回预览不存在、已过期、用过了，或不是你在这个项目里做的，请重新预览");
      const picked = input.row_ids.map(row_id => ({ row_id, row: preview.rows.get(row_id) }));
      const refused = picked.find(({ row }) => row?.status !== "applicable");
      if (refused) throw agentDefinitionErrors.overrides_row_not_applicable("只有能套用的行可以确认", { row_id: refused.row_id, status: refused.row?.status ?? "unknown" });
      held.delete(input.preview_id);
      await caller.beforeEffect();
      const register = definitions(), applied: Array<{ key: string; revision: number }> = [], skipped: Array<{ row_id: string; reason: string }> = [];
      for (const { row_id, row } of picked) {
        // The default may have moved, or the prompt been edited elsewhere, since the preview: that row is not applied.
        try {
          if (register.prompt(row!.key).default_version !== row!.base_version) { skipped.push({ row_id, reason: "base_mismatch" }); continue; }
          applied.push({ key: row!.key, revision: register.save(row!.key, row!.body, row!.revision, caller.actor_id).user!.revision });
        } catch (error) { skipped.push({ row_id, reason: error instanceof ActionError ? error.code : "failed" }); }
      }
      return { applied, skipped };
    }),
  ];
}
