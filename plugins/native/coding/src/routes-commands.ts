import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginActionClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { PROMPT_COMMAND_LIMITS, PROMPT_COMMAND_LOCATIONS, personalPromptCommandsCapability, type PromptCommandFile, type PromptCommandLocation } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { mergePromptCommands, readPromptCommand } from "@molis-ai/molis-work-plugin-sdk";
import type { CodingActivation } from "./route-activation.js";
import { codingActions } from "./route-entry.js";

/**
 * Prompt commands (Coding A2, docs/design/coding-daily-basics scheme A): the project's, from the round's workspace (`.molis/commands`,
 * then `.claude/commands`), and the person's own, which the Host reads from their home directory (`commands.personal.list@1`). On a
 * name clash the project's wins. A command is only prompt text: the page fills it with what was typed and sends it as the task, with
 * no permission, tool or model from the file. A file that cannot be read is listed with why, and the others still work.
 */

export type CodingPromptCommand = PromptCommandFile & { readonly origin: "project" | "mine" };

/** The `.md` files of one place in the workspace, one folder down at most, read through the Host's workspace reader. */
async function placeCommands(actions: PluginActionClient, workspaceId: string, location: PromptCommandLocation): Promise<PromptCommandFile[]> {
  const base = location.split("/");
  const list = async (path: readonly string[]) => {
    const read = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [...base, ...path], kind: "directory" });
    return read.outcome === "directory" ? [...read.entries].sort((a, b) => a.name.localeCompare(b.name)) : [];
  };
  const files: { path: string; kind: "file" | "other" }[] = [];
  for (const entry of await list([])) {
    if (files.length >= PROMPT_COMMAND_LIMITS.files || entry.name.startsWith(".")) continue;
    if (entry.kind === "directory") {
      for (const inner of await list([entry.name])) {
        if (files.length >= PROMPT_COMMAND_LIMITS.files || inner.name.startsWith(".") || inner.kind === "directory") continue;
        if (/\.md$/iu.test(inner.name)) files.push({ path: `${entry.name}/${inner.name}`, kind: inner.kind });
      }
    } else if (/\.md$/iu.test(entry.name)) files.push({ path: entry.name, kind: entry.kind });
  }
  const found: PromptCommandFile[] = [];
  for (const file of files) {
    const read = file.kind === "file" ? await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [...base, ...file.path.split("/")], kind: "text" }) : null;
    const command = read?.outcome === "text" ? readPromptCommand({ location, path: file.path, text: read.text, bytes: new TextEncoder().encode(read.text).byteLength })
      : read?.outcome === "too-large" ? readPromptCommand({ location, path: file.path, text: "", bytes: read.bytes })
      : read?.outcome === "binary" || read?.outcome === "unsupported" ? readPromptCommand({ location, path: file.path, text: null, bytes: 0 })
      : null;
    if (command) { found.push(command); continue; }
    // Not a plain file the Host would read (a link out of the folder, say), or gone since it was listed.
    const name = readPromptCommand({ location, path: file.path, text: "", bytes: 0 })?.name;
    if (name) found.push({ name, location, path: file.path, unreadable: "unreadable" });
  }
  return found;
}

export const commandRoutes = (a: CodingActivation): PluginRouteBinding[] => [
  a.route("coding.commands", async (request, _api, _execution, beforeWrite) => {
    const actions = codingActions(a.context, beforeWrite), workspace = typeof request.query?.workspace === "string" ? request.query.workspace : "";
    const project = workspace ? (await Promise.all(PROMPT_COMMAND_LOCATIONS.map(location => placeCommands(actions, workspace, location)))).flat() : [];
    // The person's own: none when this installation was not given `commands:read`.
    const mine = await actions.invoke(personalPromptCommandsCapability, {}).then(found => found.commands, () => [] as PromptCommandFile[]);
    const commands: CodingPromptCommand[] = mergePromptCommands<CodingPromptCommand>(project.map(one => ({ ...one, origin: "project" as const })), mine.map(one => ({ ...one, origin: "mine" as const })));
    return { commands };
  }),
];
