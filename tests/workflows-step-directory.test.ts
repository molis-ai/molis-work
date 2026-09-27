import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-workflow-steps-token-0123456789";

test("the workflow editor offers every native plugin's workflow commands, derived from their manifests rather than a Host list", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workflow-steps-"));
  const home = path.join(directory, ".molis-work");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "流程步骤", actor_id: "user" });
  catalog.close();
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${origin}/projects/${encodeURIComponent(project.project_id)}/api/workflows/steps/actions`, {
      headers: { origin, "x-molis-work-control-token": TOKEN } });
    assert.equal(response.status, 200, await response.clone().text());
    const { actions } = await response.json() as { actions: Array<{ ref: { capability_id: string }; group: string }> };
    const offered = new Set(actions.map(row => row.ref.capability_id));
    // Plugins the old hand-written caller list left out; each declares workflow use in its own manifest.
    for (const id of ["dataset.create", "form.create", "ppt.create", "shelf.items.admit", "images.generate"]) {
      const declared = BUILTIN_PLUGIN_CATALOG.some(entry => entry.manifest.actions?.some(action => action.capability_id === id && action.action.audiences.includes("workflow")));
      if (declared || id === "shelf.items.admit") assert.ok(offered.has(id), `${id} is offered as a workflow step`);
    }
    assert.ok(new Set(actions.map(row => row.group)).size >= 10, "steps come from many plugins, grouped by provider");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
