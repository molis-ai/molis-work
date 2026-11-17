import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TestHome, TestProject } from "./test-home.js";

export async function attachAutomationWorkspace(fixture: TestHome, project: TestProject, folder: string, actor = LOCAL_PERSON_ACTOR_ID) {
  const catalog = fixture.host.ensureWebCatalog(fixture.home, openMolisWorkProjectCatalog);
  await catalog.withCatalog({ homeDirectory: fixture.home }, owner => owner.addWorkspaceProject({
    canonical_path: folder, project_id: project.project_id, actor_id: actor, user_confirmed: true,
  }));
}
