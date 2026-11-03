import type Database from "better-sqlite3";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { CreateAndBindRuntimeContextInput } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectsQueryApi } from "@molis-ai/molis-work-contracts/modules/projects";
import { RuntimeContextBindingRepository } from "./context-bindings.js";
import { RuntimeProjectBindingCommands, type RuntimeProjectBindingPorts } from "./project-binding-commands.js";
import type { RuntimeProjectBindingValidation } from "./project-binding-validation.js";
import { RuntimeProjectResolution } from "./project-resolution.js";
import { createRuntimeProjectSetup, type RuntimeProjectSetupPorts } from "./project-setup.js";
import { RuntimeBindingRecords } from "./runtime-binding-records.js";

export interface RuntimeContextModuleOptions {
  db: Database.Database;
  ledger: ContextLedgerApi;
  projects: RuntimeProjectBindingPorts & { query: ProjectsQueryApi };
  validation: RuntimeProjectBindingValidation;
}

/** The owner composes binding facts and commands; the Host supplies project provisioning and its compensation. */
export function createRuntimeContextModule({ db, ledger, projects, validation }: RuntimeContextModuleOptions) {
  const repository = new RuntimeContextBindingRepository(db, {
    ledger, assertProject: projectId => { projects.query.getProject(projectId); },
  });
  const resolution = new RuntimeProjectResolution(projects.query, repository);
  const transaction = <T>(operation: () => T): T => db.transaction(operation)();
  const records = new RuntimeBindingRecords(repository, projects, validation);
  const commands = new RuntimeProjectBindingCommands(repository, resolution, projects, validation, transaction, records);
  return {
    commands,
    records,
    removeProjectFacts: (projectId: string, actorId: string, at: string) => repository.removeProjectFacts(projectId, actorId, at),
    createProjectAndBindRuntimeContext: (input: CreateAndBindRuntimeContextInput,
      provision: Pick<RuntimeProjectSetupPorts, "registerProject" | "provisionCreatedProject">) => createRuntimeProjectSetup({
      bindings: commands, records, validation, transaction,
      getProject: projectId => projects.query.getProject(projectId),
      registerProject: provision.registerProject,
      provisionCreatedProject: provision.provisionCreatedProject,
      insertSetupRequest: request => repository.insertSetupRequest(request),
    })(input),
  };
}
