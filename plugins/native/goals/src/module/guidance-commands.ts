import type {
  AddProjectGuidanceInput,
  AddProjectGuidanceResult,
  ProjectGuidanceView,
  UpdateProjectGuidanceInput,
  UpdateProjectGuidanceResult,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext } from "./command-support.js";
import { projectGuidanceView } from "./guidance.js";
import { addProjectGuidance } from "./guidance-add.js";
import { updateProjectGuidance } from "./guidance-update.js";

export class GuidanceCommands {
  constructor(private readonly context: GoalsCommandContext) {}

  read(projectId: string): ProjectGuidanceView {
    this.context.requireBoard(projectId);
    const repository = this.context.repository;
    return projectGuidanceView({
      entries: repository.listProjectGuidanceEntries(projectId, true),
      revisions: repository.listProjectGuidanceRevisions(projectId),
    });
  }

  add(input: AddProjectGuidanceInput): AddProjectGuidanceResult {
    return addProjectGuidance(this.context, input);
  }

  update(input: UpdateProjectGuidanceInput): UpdateProjectGuidanceResult {
    return updateProjectGuidance(this.context, input);
  }
}
