import type { DatabaseSync } from "node:sqlite";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";

/** Where a native launch stands: written before the terminal is asked for a process, then whether it took the request. */
export type CharacterRunStatus = "starting" | "dispatched" | "failed";

/** One native launch of a published Character as the page lists it. The terminal's output is not kept: the terminal shows it while the process runs. */
export interface CharacterNativeRun {
  run_id: string; panel_id: string; title: string; created_at: string; reference: ArtifactReference;
  workspace_path: string; status: CharacterRunStatus; status_message: string | null;
}

/** A run with the request it answers (who, which project and Character, which task and folder), so a repeated request can be told from another one. */
export interface CharacterRunRecord {
  run: CharacterNativeRun;
  owner_actor_id: string; project_id: string; character_id: string; task: string; workspace_id: string; runtime_id: string; bundle_path: string;
}

/** What a launch writes before it asks for a process; the store adds the id, the time, the owner, the project and the first status. */
export interface CharacterRunStart {
  panel_id: string; title: string; reference: ArtifactReference; workspace_path: string;
  character_id: string; task: string; workspace_id: string; runtime_id: string; bundle_path: string;
}

/** The native runs Characters keeps for one person in one project (`character_runs`, store version 2). */
export interface CharacterRuns {
  /** This person's runs of a Character in this project, newest first. */
  list(characterId: string): CharacterNativeRun[];
  /** The run a terminal panel belongs to, whoever launched it: a panel id is taken once, so the caller compares the request. */
  byPanel(panelId: string): CharacterRunRecord | null;
  start(run: CharacterRunStart): CharacterRunRecord;
  /** Records whether the terminal took the request and returns the run as it now reads. */
  settle(run: CharacterNativeRun, status: Exclude<CharacterRunStatus, "starting">, message: string): CharacterNativeRun;
}

/** A type literal, not an interface, so a row SQLite returns can be read as one. */
type Row = {
  run_id: string; panel_id: string; owner_actor_id: string; project_id: string; character_id: string; artifact_id: string; artifact_version: number;
  title: string; task: string; workspace_id: string; workspace_path: string; runtime_id: string; bundle_path: string;
  status: CharacterRunStatus; status_message: string | null; created_at: string; updated_at: string;
};

const record = (row: Row): CharacterRunRecord => ({
  run: { run_id: row.run_id, panel_id: row.panel_id, title: row.title, created_at: row.created_at, reference: { artifact_id: row.artifact_id, version: row.artifact_version },
    workspace_path: row.workspace_path, status: row.status, status_message: row.status_message },
  owner_actor_id: row.owner_actor_id, project_id: row.project_id, character_id: row.character_id, task: row.task, workspace_id: row.workspace_id,
  runtime_id: row.runtime_id, bundle_path: row.bundle_path });

export class CharacterRunsRepository implements CharacterRuns {
  constructor(private readonly db: DatabaseSync, private readonly actorId: string, private readonly projectId: string,
    private readonly now: () => string = () => new Date().toISOString()) {}

  list(characterId: string): CharacterNativeRun[] {
    return (this.db.prepare("SELECT * FROM character_runs WHERE owner_actor_id = ? AND project_id = ? AND character_id = ? ORDER BY created_at DESC, run_id")
      .all(this.actorId, this.projectId, characterId) as Row[]).map(row => record(row).run);
  }

  byPanel(panelId: string): CharacterRunRecord | null {
    const row = this.db.prepare("SELECT * FROM character_runs WHERE panel_id = ?").get(panelId) as Row | undefined;
    return row ? record(row) : null;
  }

  start(start: CharacterRunStart): CharacterRunRecord {
    const at = this.now(), runId = crypto.randomUUID();
    this.db.prepare(`INSERT INTO character_runs (run_id, panel_id, owner_actor_id, project_id, character_id, artifact_id, artifact_version, title, task,
      workspace_id, workspace_path, runtime_id, bundle_path, status, status_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'starting', NULL, ?, ?)`)
      .run(runId, start.panel_id, this.actorId, this.projectId, start.character_id, start.reference.artifact_id, start.reference.version, start.title, start.task,
        start.workspace_id, start.workspace_path, start.runtime_id, start.bundle_path, at, at);
    return { run: { run_id: runId, panel_id: start.panel_id, title: start.title, created_at: at,
      reference: { artifact_id: start.reference.artifact_id, version: start.reference.version },
      workspace_path: start.workspace_path, status: "starting", status_message: null },
    owner_actor_id: this.actorId, project_id: this.projectId, character_id: start.character_id, task: start.task, workspace_id: start.workspace_id,
    runtime_id: start.runtime_id, bundle_path: start.bundle_path };
  }

  settle(run: CharacterNativeRun, status: Exclude<CharacterRunStatus, "starting">, message: string): CharacterNativeRun {
    this.db.prepare("UPDATE character_runs SET status = ?, status_message = ?, updated_at = ? WHERE run_id = ? AND owner_actor_id = ? AND project_id = ?")
      .run(status, message, this.now(), run.run_id, this.actorId, this.projectId);
    return { ...run, status, status_message: message };
  }
}
