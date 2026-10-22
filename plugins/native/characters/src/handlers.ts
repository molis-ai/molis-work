import type { ActionDefinition, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { charactersActions } from "./actions.js";

/**
 * What the owner's handlers (modules/characters) need from the running plugin: the project it runs in, its 成果库 client and the
 * built-in Agent's catalog. They exist only in the Runtime's services, so this plugin supplies them when it starts.
 */
export interface CharactersHandlerRuntime {
  readonly projectId: string;
  readonly artifacts: Pick<PluginArtifactClient, "publish" | "read">;
  /** Absent while the capability directory is not connected; read at each call. */
  readonly agent?: {
    listRuntimes(): Promise<ReadonlyArray<{ readonly runtime_id: string; readonly supports_action_tools?: boolean }>>;
    listActions(): Promise<readonly ActionView[]>;
  };
}

/** A launch is given the binding's own controls, which keep the original caller's cancellation and final authority check. */
export interface CharacterLaunchControl { beforeStart(): Promise<void>; assert_current(): void }

type Actions = typeof charactersActions;
/** An action's handler: its input, and for a command that writes the binding's `beforeWrite`. */
type Handle<Definition, Rest extends unknown[] = [beforeWrite: () => Promise<void>]> =
  Definition extends ActionDefinition<infer Input, infer Output> ? (input: Input, ...rest: Rest) => Output | Promise<Output> : never;

/**
 * One handler per Characters action, with the types its definition declares. The handlers are the owner's (modules/characters); the
 * Host builds them from its ports and this plugin only binds each to its action.
 */
export type CharactersHandlers = { [Name in Exclude<keyof Actions, "artifactPreview" | "launch">]: Handle<Actions[Name]> } & {
  artifactPreview(artifact: ArtifactVersionRecord): { media_type: string; text?: string };
  launch: Handle<Actions["launch"], [control: CharacterLaunchControl]>;
};
