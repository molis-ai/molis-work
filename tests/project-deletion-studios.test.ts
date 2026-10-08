import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, createMolisWorkLocalHost, molisWorkHostProjectReference, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as alchemist, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { IMAGES_STORE_BASELINE } from "@molis-ai/molis-work-plugin-images";
import { applySqliteBaseline, createFileSecretStore, homeSqlitePath, openHomeSqliteDatabase, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";

type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
type Host = ReturnType<typeof createMolisWorkLocalHost>;

/** A Home with a catalog and a running Host over it, the way the Web server has them. */
async function withHost<T>(run: (env: { home: string; catalog: Catalog; host: Host; direction: (projectId: string, databasePath: string) => ReturnType<typeof bindActionClient> }) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-studios-"));
  const home = join(directory, "home");
  const { ai } = controlledAlchemistAi();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const host = createMolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture" }, completeText: null });
  try {
    const direction = (projectId: string, databasePath: string) => bindActionClient(host.actionClient(molisWorkHostProjectReference({ databasePath, projectId })),
      () => ({ actor_id: "local-person", project_id: projectId, audience: "user" as const, permissions: ALCHEMIST_ACTION_PERMISSIONS }));
    return await run({ home, catalog, host, direction });
  } finally {
    await host.close();
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });
const studioDirectory = (home: string, projectId: string) => join(home, "alchemist", "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));

test("deleting a project closes its Alchemist studio and removes its directory, and the same id starts empty", async () => {
  await withHost(async ({ home, catalog, host, direction }) => {
    const project = await catalog.createProject({ display_name: "研究项目", actor_id: "test-user" });
    const other = await catalog.createProject({ display_name: "另一个项目", actor_id: "test-user" });
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const created = await direction(project.project_id, project.database_path).invoke(alchemist.directionCreate, { description: "被删除项目里的私密研究方向" });
    await direction(other.project_id, other.database_path).invoke(alchemist.directionCreate, { description: "留下的项目里的研究方向" });
    assert.equal(existsSync(join(studioDirectory(home, project.project_id), "studio.sqlite")), true);
    assert.equal(host.status().projects.some(row => row.project_id === project.project_id), true, "the project's runtime is open");

    const result = await catalog.deleteProject(deletion(project.project_id));

    assert.equal(result.deletion.cleanup_state, "complete");
    assert.deepEqual(result.deletion.owner_steps.filter(step => ["alchemist", "project-runtime"].includes(step.owner_id)).map(step => [step.owner_id, step.state]), [["project-runtime", "complete"], ["alchemist", "complete"]]);
    assert.equal(existsSync(studioDirectory(home, project.project_id)), false, "the studio directory is gone");
    assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false, "the project's open runtime is closed");
    assert.equal(existsSync(join(studioDirectory(home, other.project_id), "studio.sqlite")), true, "another project's studio is untouched");

    // The same project id made again (the fixed-id demo can be): its studio must not be the old one still running.
    await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true });
    const demo = catalog.getProject(DEMO_PROJECT_ID);
    await direction(DEMO_PROJECT_ID, demo.database_path).invoke(alchemist.directionCreate, { description: "示例项目里的方向" });
    const before = (await direction(DEMO_PROJECT_ID, demo.database_path).invoke(alchemist.bootstrap, {})).directions.map((item: { id: string }) => item.id);
    assert.equal(before.length, 1);
    await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove" });
    await catalog.ensureDemoProject({ actor_id: "test-user", user_confirmed: true });
    const again = catalog.getProject(DEMO_PROJECT_ID);
    const after = (await direction(DEMO_PROJECT_ID, again.database_path).invoke(alchemist.bootstrap, {})).directions;
    assert.deepEqual(after, [], "the recreated demo sees none of the old directions");
    assert.ok(created.direction.id);
    assert.equal(ref.project_id, project.project_id);
  });
});

test("deleting a project removes its Plugin Studio builds and releases and the secrets saved for its generated plugins", async () => {
  await withHost(async ({ home, catalog }) => {
    const project = await catalog.createProject({ display_name: "创作项目", actor_id: "test-user" });
    const other = await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" });
    for (const id of [project.project_id, other.project_id]) {
      mkdirSync(join(home, "plugin-builder", id, "releases", "build-1", "v1"), { recursive: true });
      writeFileSync(join(home, "plugin-builder", id, "releases", "build-1", "v1", "plugin.mjs"), "export default {};");
    }
    const secrets = (id: string) => `plugin-builder-secret:${id}:com.example.plugin:token`;
    runWithMolisWorkHome(home, () => {
      const store = createFileSecretStore();
      store.put(secrets(project.project_id), "sk-deleted");
      store.put(secrets(other.project_id), "sk-kept");
      store.put(`plugin-builder-secret:${project.project_id}-sibling:com.example.plugin:token`, "sk-sibling");
    });

    const result = await catalog.deleteProject(deletion(project.project_id));

    assert.equal(result.deletion.cleanup_state, "complete");
    assert.equal(result.deletion.owner_steps.find(step => step.owner_id === "plugin-builder")?.state, "complete");
    assert.equal(existsSync(join(home, "plugin-builder", project.project_id)), false, "builds and releases are gone");
    assert.equal(existsSync(join(home, "plugin-builder", other.project_id, "releases", "build-1", "v1", "plugin.mjs")), true);
    runWithMolisWorkHome(home, () => {
      assert.equal(peekSealedEntry(secrets(project.project_id)), null, "the sealed secret is gone");
      assert.notEqual(peekSealedEntry(secrets(other.project_id)), null, "another project's secret stays");
      assert.notEqual(peekSealedEntry(`plugin-builder-secret:${project.project_id}-sibling:com.example.plugin:token`), null, "a project whose id only starts the same keeps its secret");
    });
  });
});

test("a running Host's owners clear what only they can: pictures being made, the search index, the runtime", async () => {
  await withHost(async ({ home, catalog, host }) => {
    const project = await catalog.createProject({ display_name: "图片项目", actor_id: "test-user" });
    mkdirSync(join(home, "images", "assets"), { recursive: true });
    writeFileSync(join(home, "images", "assets", "aaaa-0001.png"), "png");
    const images = openHomeSqliteDatabase(home, "images");
    applySqliteBaseline(images, homeSqlitePath(home, "images"), IMAGES_STORE_BASELINE);
    images.prepare(`INSERT INTO jobs (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
      VALUES ('job-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(project.project_id, "request-1", "hash", "c", "c", "openai-images", "m", "提示词", "", "", "succeeded",
      JSON.stringify([{ id: "i", filename: "aaaa-0001.png", mime_type: "image/png", byte_length: 3 }]), "", new Date().toISOString(), new Date().toISOString(), null);
    images.close();

    const owners = projectDeletedHooksFor(home).owners().map(owner => owner.id);
    for (const id of ["project-runtime", "images", "alchemist", "search", "plugin-builder"]) assert.ok(owners.includes(id), `${id} is registered`);
    assert.ok(owners.indexOf("project-runtime") < owners.indexOf("alchemist"), "the runtime closes before the data it ran on goes");

    const result = await catalog.deleteProject(deletion(project.project_id));
    assert.equal(result.deletion.cleanup_state, "complete", JSON.stringify(result.deletion.owner_steps.filter(step => step.state !== "complete")));
    const check = openHomeSqliteDatabase(home, "images");
    try { assert.equal((check.prepare("SELECT COUNT(*) n FROM jobs WHERE project_id = ?").get(project.project_id) as { n: number }).n, 0); } finally { check.close(); }
    assert.equal(existsSync(join(home, "images", "assets", "aaaa-0001.png")), false);
    assert.equal(host.status().projects.length, 0);
  });
});

test("owners of a Host that has been closed are dropped from the Home's registry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-closed-"));
  const home = join(directory, "home");
  try {
    const before = projectDeletedHooksFor(home).owners().map(owner => owner.id);
    const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
    assert.ok(projectDeletedHooksFor(home).owners().some(owner => owner.id === "project-runtime"));
    await host.close();
    const after = projectDeletedHooksFor(home).owners().map(owner => owner.id);
    assert.deepEqual(after.filter(id => !before.includes(id)), [], "nothing of the closed Host stays registered");
    assert.ok(after.includes("alchemist"), "the file-level owner of the same data is back");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
