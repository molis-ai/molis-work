import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CharacterContent, CharacterDraft, CharacterImportCandidate, CharacterImportRuntimeId, CharacterImportSelection } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PtySpawnRequest } from "@molis-ai/molis-work-contracts/services/runtime-host";

export interface CharacterNativeRun {
  session_id: string; panel_id: string; title: string; created_at: string;
  reference: ArtifactReference; workspace_path: string; output: string;
}
export interface CharactersImportPorts {
  previewFile(candidateId: string, input: Record<string, unknown>): unknown;
  discover(input: { runtime_id?: CharacterImportRuntimeId; config_root?: string; project_root?: string }): CharacterImportCandidate[];
  import(candidateId: string, selection: CharacterImportSelection, existing?: { character_id: string; expected_revision: number }): { draft: CharacterDraft; replayed: boolean };
  execution(content: CharacterContent): Promise<{ executable: string | null; workspaces: Array<{ workspace_id: string; canonical_path: string }>; notice: string }>;
  launch(content: CharacterContent, reference: ArtifactReference, input: { workspace_id: string; task: string; request_id: string }): Promise<{ run: CharacterNativeRun; spawn: PtySpawnRequest }>;
  runs(characterId: string): Promise<CharacterNativeRun[]>;
}
