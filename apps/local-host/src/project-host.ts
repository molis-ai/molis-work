import { InteractionObserver } from './casebook/observer.js';
import path from "node:path";
import { existsSync } from "node:fs";
import { ProjectRecoveryError } from "./project-migrations.js";
import { LocalHost } from "./local-host.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { LocalProjectDatabase } from "./project-database.js";
import { registerProjectCapabilities } from "./project-capabilities.js";
import { releaseCodingSurface } from "./coding-surface.js";
import type { HostCapabilityDefinition, LocalHostProjectClient, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

export interface MolisWorkProjectRuntime {
  store: LocalProjectDatabase;
  coordinator: GoalProjectApplication;
  /** Which project this runtime serves. Capabilities scope their answers to it. */
  project_id: string;
  /** The board behind this project. Review queues and events are board scoped. */
  board_id: string;
  interactionObserver?: InteractionObserver;
}

export interface MolisWorkLocalHostOptions {
  planningMethods?: () => readonly PlanningMethodPack[];
  clock?: () => Date;
  instanceId?: string;
  onRuntimeOpen?: (reference: LocalHostProjectReference) => void;
  onRuntimeClose?: (reference: LocalHostProjectReference) => void;
  /**
   * Resolves the workspace a project is bound to. The catalog lives at the Home
   * level, above a single project's database, so the composition supplies it.
   *
   * Left out, the workspace Capability is **not registered at all**: a Plugin
   * then sees it as unavailable, which is true, instead of an answer of "no
   * workspace", which would not be.
   */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
}

export function molisWorkHostProjectReference(input: {
  databasePath: string;
  boardId: string;
  projectId?: string | null;
}): LocalHostProjectReference {
  const storageKey = path.resolve(input.databasePath);
  const boardId = input.boardId.trim() || `database:${storageKey}`;
  return {
    project_id: input.projectId?.trim() || boardId,
    board_id: boardId,
    storage_key: storageKey,
  };
}

/**
 * The project composition owner: one database and application per Host runtime.
 */
export class MolisWorkLocalHost {
  private readonly host: LocalHost<MolisWorkProjectRuntime>;
  private readonly existingOnly = new Set<string>();

  constructor(options: MolisWorkLocalHostOptions = {}) {
    this.host = new LocalHost({
      instanceId: options.instanceId,
      observation: {
        before: (runtime, reference, capability, input) => {
          runtime.interactionObserver ??= new InteractionObserver(runtime.store, runtime.coordinator, reference.board_id, reference.project_id);
          return runtime.interactionObserver.before(capability, input);
        },
        after: (runtime, ticket, result, threw) => runtime.interactionObserver?.after(ticket, result, threw),
      },
      runtimeFactory: {
        open: (reference) => {
          options.onRuntimeOpen?.(reference);
          const recovering = this.existingOnly.has(reference.storage_key);
          if (recovering && !existsSync(reference.storage_key)) throw new ProjectRecoveryError("project_recovery_missing");
          const store = new LocalProjectDatabase(reference.storage_key, { existingOnly: recovering });
          if (recovering && !store.goalsQuery.getBoard(reference.board_id)) {
            store.close();
            throw new ProjectRecoveryError("project_recovery_board_missing");
          }
          const coordinator = new GoalProjectApplication(
            store,
            options.clock ?? (() => new Date()),
            [...(options.planningMethods?.() ?? [])],
          );
          return {
            store,
            coordinator,
            project_id: reference.project_id,
            board_id: reference.board_id,
          };
        },
        close: async (runtime, reference) => {
          await releaseCodingSurface(runtime.store, runtime.board_id);
          runtime.store.close();
          options.onRuntimeClose?.(reference);
        },
      },
    });
    registerProjectCapabilities(
      this.host,
      { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor },
    );
  }

  /**
   * Register one more Capability against this Host.
   *
   * The seam exists so a composition root can wire in services this package
   * must not depend on — the Agent Host above all, which drags a vendored SDK
   * behind it. Whoever owns that service registers it; `local-host` stays free
   * of the dependency, and a service nobody wired is simply not registered,
   * which is what a Plugin should then see.
   */
  registerCapability<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: (runtime: MolisWorkProjectRuntime, input: Input) => Output | Promise<Output>,
  ): () => void {
    return this.host.register(definition, handler);
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    return this.host.client(reference);
  }

  withProject<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.host.withRuntime(reference, operation);
  }

  /** Only the configured owner calls this; never initialize, create or migrate a project. */
  async restoreExistingProject(reference: LocalHostProjectReference): Promise<void> {
    this.existingOnly.add(reference.storage_key);
    try { await this.withProject(reference, () => undefined); }
    finally { this.existingOnly.delete(reference.storage_key); }
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  close(): Promise<void> {
    return this.host.close();
  }

  status(): LocalHostStatus {
    return this.host.status();
  }
}

export function createMolisWorkLocalHost(options: MolisWorkLocalHostOptions = {}): MolisWorkLocalHost {
  return new MolisWorkLocalHost(options);
}
