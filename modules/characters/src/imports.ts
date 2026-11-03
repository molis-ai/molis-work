import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CharacterContent, CharacterDraft, CharacterImportCandidate, CharacterImportRuntimeId, CharacterImportSelection } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharacterNativeRun } from "./runs.js";

/** How the page reaches a run's terminal: its panel, attached only, so reopening never starts the task again. */
export interface CharacterTerminalAttach { panelId: string; attachOnly: true }
export interface CharacterLaunchControl { beforeStart(): Promise<void>; assert_current(): void }
export interface CharactersImportPorts {
  previewFile(candidateId: string, input: Record<string, unknown>): unknown;
  discover(input: { runtime_id?: CharacterImportRuntimeId; config_root?: string; project_root?: string }): CharacterImportCandidate[];
  import(candidateId: string, selection: CharacterImportSelection, existing?: { character_id: string; expected_revision: number }): { draft: CharacterDraft; replayed: boolean };
  execution(content: CharacterContent): Promise<{ executable: string | null; workspaces: Array<{ workspace_id: string; canonical_path: string }>; notice: string }>;
  launch(content: CharacterContent, reference: ArtifactReference, input: { workspace_id: string; task: string; request_id: string }, control?: CharacterLaunchControl): Promise<{ run: CharacterNativeRun; spawn: CharacterTerminalAttach }>;
  runs(characterId: string): Promise<CharacterNativeRun[]>;
}
