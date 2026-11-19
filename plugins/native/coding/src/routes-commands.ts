import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { personalPromptCommandsCapability, projectPromptCommandsCapability, type PromptCommandFile } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { mergePromptCommands } from "@molis-ai/molis-work-plugin-sdk";
import type { CodingActivation } from "./route-activation.js";
import { codingActions } from "./route-entry.js";

/**
 * Prompt commands (Coding A2, docs/design/coding-daily-basics scheme A): the project's, from the round's workspace (`.molis/commands`,
 * then `.claude/commands`, `commands.project.list@1`), and the person's own from their home directory (`commands.personal.list@1`), each
 * read by the Host in one call. On a name clash the project's wins. A command is only prompt text: the page fills it with what was typed
 * and sends it as the task, with no permission, tool or model from the file. A file that cannot be read is listed with why, and the others still work.
 */

export type CodingPromptCommand = PromptCommandFile & { readonly origin: "project" | "mine" };

export const commandRoutes = (a: CodingActivation): PluginRouteBinding[] => [
  a.route("coding.commands", async (request, _api, _execution, beforeWrite) => {
    const actions = codingActions(a.context, beforeWrite), workspace = typeof request.query?.workspace === "string" ? request.query.workspace : "";
    // The person's own: none when this installation was not given `commands:read`; the project's: none for a folder that is not its.
    const none = () => [] as PromptCommandFile[];
    const [project, mine] = await Promise.all([workspace ? actions.invoke(projectPromptCommandsCapability, { workspace_id: workspace }).then(found => found.commands, none) : none(),
      actions.invoke(personalPromptCommandsCapability, {}).then(found => found.commands, none)]);
    const commands: CodingPromptCommand[] = mergePromptCommands<CodingPromptCommand>(project.map(one => ({ ...one, origin: "project" as const })), mine.map(one => ({ ...one, origin: "mine" as const })));
    return { commands };
  }),
];
