import type {
  PluginAppContribution,
  PluginCommandInput,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { codingEventTypes } from "./events.js";
import { codingManifest } from "./manifest.js";
import { codingPrompts } from "./roles.js";
import { codingSettingsContribution, codingUiContribution } from "./ui.js";
import { codingRoutes, type CodingExecutionPorts } from "./routes.js";

/**
 * Coding as something Plugin Runtime starts, isolated, rather than something
 * the build wires in.
 *
 * `start` asks for the grants the Manifest declared instead of assuming them:
 * a Host that did not grant `artifact:write` fails activation here, loudly,
 * rather than at the first attempt to publish a change set.
 */

/**
 * The object a command acts on, taken from the input the shell handed over
 * rather than from whatever happened to be open.
 */
function objectIdFor(commandId: string, input: PluginCommandInput): string {
  if (input.kind === "agent-session") return input.session_id;
  if (input.kind === "object") return input.ref.object_id;
  if (input.kind === "artifacts") {
    const first = input.references[0];
    if (first !== undefined) return first.artifact_id;
  }
  return commandId;
}

function commandTitle(commandId: string): string {
  if (commandId === "coding.open-changeset") return "变更";
  if (commandId === "coding.open-report") return "报告";
  return "Coding";
}

export interface CodingPluginPorts {
  execution?: CodingExecutionPorts;
  /** Called on stop so the Plugin can release what it opened. */
  onStop?(context: PluginStartContext): void | Promise<void>;
  /**
   * Whether there is an object this command could open right now.
   *
   * Left out, object commands report unavailable rather than opening an empty
   * surface.
   */
  hasObject?(commandId: string): { available: true } | { available: false; reason: string };
}

export function createCodingPlugin(ports: CodingPluginPorts = {}): PluginDefinition {
  return {
    manifest: codingManifest,
    event_types: codingEventTypes,
    agent_prompts: codingPrompts,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of codingManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      return {
        kind: "app",
        views: [codingUiContribution, codingSettingsContribution],
        routes: codingRoutes(context, ports.execution),
        /**
         * A command is offered only when it can actually do something. Opening
         * a change set needs a session; opening a report needs a report. An
         * entry that is present but does nothing is worse than one that says
         * why it is not available.
         */
        commandAvailability: (commandId) => {
          if (commandId === "coding.new-session") return { available: true };
          if (commandId === "coding.open-changeset" || commandId === "coding.open-report") {
            return ports.hasObject?.(commandId) ?? { available: false, reason: "还没有可打开的对象" };
          }
          return { available: false, reason: `未知命令：${commandId}` };
        },
        executeCommand: (commandId, input) => ({
          ref: { view_id: "directory", object_id: objectIdFor(commandId, input) },
          title: commandTitle(commandId),
        }),
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(context: PluginStartContext): Promise<{ ok: boolean; message: string }> {
      // Honest about the one thing that decides whether a Run can start at all.
      const capabilities = context.services?.capabilities;
      return capabilities === undefined
        ? { ok: false, message: "宿主没有提供能力入口，起不了 Run" }
        : { ok: true, message: "就绪" };
    },
  };
}
