import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Use the packages built in the measured checkout, even when the calling script lives in the candidate.
async function seed(root, home) {
  const { openMolisWorkProjectCatalog } = await import(pathToFileURL(join(root, "apps/desktop/dist/index.js")).href);
  const { PROJECT_SCOPED_PLUGIN_IDS } = await import(pathToFileURL(join(root, "apps/local-host/dist/index.js")).href);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const actor_id = "first-screen-report";
  try {
    const plain = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000001", display_name: "默认项目", actor_id });
    const crowded = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000002", display_name: "全部插件", actor_id });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: crowded.project_id, plugin_id, actor_id });
    const demo = (await catalog.ensureDemoProject({ actor_id, user_confirmed: true })).project;
    return [
      { id: "arrival-empty", path: "/onboarding" },
      { id: "chooser", path: "/", project: demo.project_id },
      { id: "workbench-default", path: `/projects/${plain.project_id}/`, project: plain.project_id },
      { id: "workbench-all-plugins", path: `/projects/${crowded.project_id}/`, project: crowded.project_id },
      { id: "workbench-demo", path: `/projects/${demo.project_id}/`, project: demo.project_id },
      { id: "settings", path: "/settings/appearance" },
      { id: "catalog", path: "/__ui/catalog" },
    ];
  } finally { catalog.close(); }
}

const [root, home] = process.argv.slice(2);
try {
  const pages = await seed(root, home);
  process.send(pages);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally { process.disconnect(); }
