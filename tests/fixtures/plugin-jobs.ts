import type { ActionAudience, ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginJobControl, PluginKeptJob, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeProbe } from "./home-runtime.js";

type Keep = (job: string, id: string) => PluginKeptJob;

/**
 * A Home plugin that keeps activation jobs (PG-038). Its command `keep` keeps one (`follow` unless the input names another; its query `peek` tries the same), its
 * `start()` may keep one through `behavior.onStart`, and a job may call the plugin's own `note` (offered to plugins only) or
 * `mcp-only` (offered to MCP only). By default a job's work is one write of `result.<id>` through the platform's storage.
 */
export function jobProbe(name = "jobprobe", scope: "home" | "project" = "home") {
  const probe = homeProbe(name), kept: PluginKeptJob[] = [], controls: PluginJobControl[] = [], noted: ActionExecutionContext[] = [], refused: unknown[] = [];
  const input = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 }, job: { type: "string" } } };
  const command = (suffix: string, audiences: ActionAudience[]): ActionDefinition<{ id: string; job?: string }, string> =>
    ({ ...probe.save, capability_id: `${name}.${suffix}`, action: { ...probe.save.action, scope, audiences, permissions: ["storage:private"], input_schema: input } });
  const keep = command("keep", ["user", "mcp"]), note = command("note", ["plugin"]), mcpOnly = command("mcp-only", ["mcp"]);
  /** A query that tries to keep a job the same way. */
  const peek: typeof keep = { ...keep, capability_id: `${name}.peek`, operation: "query", action: { ...keep.action, kind: "query" } };
  const behavior = {
    /** Runs first in the command, before its own check. */
    beforeCheck: async (_caller: ActionExecutionContext) => {},
    /** `checked`: the command keeps its job once its own `beforeEffect()` returned; `unchecked`: before it; `despite`: after it refused. */
    order: "checked" as "checked" | "unchecked" | "despite",
    /** Runs in the command once its job is kept. */
    afterKeep: async (_caller: ActionExecutionContext) => {},
    work: async (context: PluginStartContext, control: PluginJobControl, id: string) => {
      await control.beforeEffect(); context.services!.storage!.set(`result.${id}`, control.job);
    },
    /** Runs in the activation's `start()`, before it returns. */
    onStart: (_context: PluginStartContext, _keep: Keep) => {},
  };
  probe.definition.manifest = { ...probe.definition.manifest, actions: [...probe.definition.manifest.actions!, keep, peek, note, mcpOnly],
    background: { jobs: [{ job_id: "follow", reason: "跟住已受理的那件事，直到它结束", permissions: ["storage:private"] },
      { job_id: "resume", reason: "激活时接上上次没有跟完的事", permissions: ["storage:private"] }] } };
  const original = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await original(context);
    if (contribution.kind !== "app") throw new Error("the job probe contributes an app");
    const run: Keep = (job, id) => {
      const handle = context.services!.background!.keep(job, async control => { controls.push(control); await behavior.work(context, control, id); });
      kept.push(handle); return handle;
    };
    behavior.onStart(context, run);
    const record = (caller: ActionExecutionContext, value: unknown) => {
      noted.push(caller); context.services!.storage!.set(`note.${(value as { id: string }).id}`, caller.actor_id); return "noted";
    };
    const keeping = async (caller: ActionExecutionContext, value: unknown) => {
      const { id, job = "follow" } = value as { id: string; job?: string };
      await behavior.beforeCheck(caller);
      if (behavior.order === "checked") await caller.beforeEffect();
      if (behavior.order === "despite") await caller.beforeEffect().catch((error: unknown) => { refused.push(error); });
      run(job, id); await behavior.afterKeep(caller); return "kept";
    };
    return { ...contribution, actions: [...contribution.actions!,
      { ...keep, handle: keeping }, { ...peek, handle: keeping }, { ...note, handle: record }, { ...mcpOnly, handle: record }] };
  };
  return { ...probe, keep, peek, note, mcpOnly, behavior, kept, controls, noted, refused,
    stored: (key: string) => probe.contexts.at(-1)!.services!.storage!.get(key) };
}
