import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { codingEventTypes } from "./events.js";
import { codingManifest } from "./manifest.js";
import { codingSkills } from "./skills.js";
import { codingPrompts } from "./roles.js";
import { codingSettingsContribution, codingUiView } from "./ui.js";
import { CodingSessionStore, toDirectoryEntries } from "./store.js";
import { codingSurface } from "./routes.js";
import { codingGoalTitles } from "./goal-titles.js";
import { codingArtifactPreviewHandler } from "./artifact-preview.js";
import { codingResultDocumentHandler } from "./results-document.js";
import { codingHomeBackgroundTasksHandler } from "./home-background.js";
import { CODING_INSTRUCTIONS } from "./prompts.js";

/**
 * Coding as something Plugin Runtime starts, isolated, rather than something
 * the build wires in.
 *
 * `start` asks for the grants the Manifest declared instead of assuming them:
 * a Host that did not grant `artifact:write` fails activation here, loudly,
 * rather than at the first attempt to publish a change set.
 */

export interface CodingPluginPorts {
  /** Called on stop so the Plugin can release what it opened. */
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createCodingPlugin(ports: CodingPluginPorts = {}): PluginDefinition {
  return {
    manifest: codingManifest,
    event_types: codingEventTypes,
    agent_prompts: codingPrompts,
    agent_skills: codingSkills,
    instructions: CODING_INSTRUCTIONS,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of codingManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      // The session tables are Coding's own, in the project's library: the platform lends them as `services.project_database`
      // (made when the library opened, `databases.project`). Without it nothing here can keep a session, so the plugin does not start.
      const database = context.services?.project_database;
      if (!database) throw new Error("宿主没有提供项目库（services.project_database），Coding 无法保存会话，不能启动");
      // The directory draws at once and cannot wait for an action, so the titles it shows are the ones the routes last read from Goals
      // (goal-titles.ts); the routes and the directory share this one cache.
      const sessions = new CodingSessionStore(database), goalTitles = codingGoalTitles(context);
      const surface = codingSurface(context, sessions, goalTitles);
      // No round survives the Home process: what the Home lists as under way from before this process started was cut off
      // (home-background.ts). Stopping and starting Coding again is not a restart: it stops only this activation's background jobs
      // (the follower and the wake loop, PG-038, S-52), while the round itself stays in the Home-level agent host. So the boundary is
      // when this process started, not when this activation did.
      const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
      return {
        kind: "app",
        // The page's session directory is read from this store at render, not by the Host from Coding's tables.
        views: [codingUiView(() => toDirectoryEntries(sessions.list(context.project_id ?? ""), goalTitles.known)), codingSettingsContribution],
        routes: surface.routes,
        actions: [...surface.actions, codingArtifactPreviewHandler, codingResultDocumentHandler(context), codingHomeBackgroundTasksHandler(context, sessions, startedAt)],
      };
    },
    // The rounds' followers and the wake loop are the activation's jobs: the platform stops them before this runs (PG-038).
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(context: PluginStartContext): Promise<{ ok: boolean; message: string }> {
      // Honest about the one thing that decides whether a Run can start at all.
      const capabilities = context.services?.actions;
      return capabilities === undefined
        ? { ok: false, message: "宿主没有提供能力入口，起不了 Run" }
        : { ok: true, message: "就绪" };
    },
  };
}
