import { readyPublication } from './fixtures/studio-publishing.js';
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { IMAGES_DATABASE } from "@molis-ai/molis-work-plugin-images";
import { applySqliteBaseline, createFileSecretStore, homeSqlitePath, openHomeSqliteDatabase, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
type Host = ReturnType<typeof createMolisWorkLocalHost>;

/** A Home with a catalog and a running Host over it, the way the Web server has them. */
async function withHost<T>(run: (env: { home: string; catalog: Catalog; host: Host }) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-studios-"));
  const home = join(directory, "home");
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const withCatalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
  try {
    return await withCatalog({ homeDirectory: home }, async catalog => await run({ home, catalog, host }));
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });

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

    // CLEAN-1: the real publisher's identity belongs to Home, not the deleted project's network-secret namespace.
    const publishing = readyPublication(home, project.project_id);
    await publishing.publish(); await publishing.workflow.close();
    const identityFile = join(home, "config", "plugin-publisher.json"), identity = readFileSync(identityFile);
    const ref = (JSON.parse(identity.toString('utf8')) as { secret_ref: string }).secret_ref;
    const result = await catalog.deleteProject(deletion(project.project_id));

    assert.ok(identity.equals(readFileSync(identityFile)), "deleting the author project preserves the Home publisher identity");
    runWithMolisWorkHome(home, () => { assert.ok(peekSealedEntry(ref), "the Home signing key stays sealed"); });
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
    applySqliteBaseline(images, homeSqlitePath(home, "images"), IMAGES_DATABASE);
    images.prepare(`INSERT INTO jobs (id,project_id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
      VALUES ('job-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(project.project_id, "request-1", "hash", "c", "c", "openai-images", "m", "提示词", "", "", "succeeded",
      JSON.stringify([{ id: "i", filename: "aaaa-0001.png", mime_type: "image/png", byte_length: 3 }]), "", new Date().toISOString(), new Date().toISOString(), null);
    images.close();

    const owners = projectDeletedHooksFor(home).owners().map(owner => owner.id);
    for (const id of ["project-runtime", "images", "search", "plugin-builder"]) assert.ok(owners.includes(id), `${id} is registered`);
    for (const id of ["assistant", "memory"]) assert.ok(owners.includes(id), `${id} is registered`);
    assert.ok(owners.indexOf("assistant") < owners.indexOf("memory"), "the Assistant's works stop before the memories they could still add to go");

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
    assert.ok(after.includes("search"), "the file-level owner of the same data is back");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
