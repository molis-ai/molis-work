import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-workspace-actions-token-0123456789";

test("project workspace actions require confirmation, repair and unlink only the folder relation, launch, and touch no files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-actions-"));
  const home = path.join(directory, ".molis-work");
  const previousPath = path.join(directory, "repository-before");
  const repairedPath = path.join(directory, "repository-after");
  await mkdir(previousPath, { recursive: true });
  await mkdir(repairedPath, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "工作目录动作", actor_id: "user" });
  catalog.close();

  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
    const mutate = (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${prefix}${pathname}`, {
      method,
      headers: {
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": `workspace-test-${method}-${pathname}`,
      },
      body: JSON.stringify(body),
    });

    const deniedAdd = await mutate("/api/workspaces", "POST", { workspace_path: previousPath });
    assert.equal(deniedAdd.status, 400);
    const addedResponse = await mutate("/api/workspaces", "POST", {
      workspace_path: previousPath,
      user_confirmed: true,
    });
    assert.equal(addedResponse.status, 201);
    const added = await addedResponse.json() as { workspace: { workspace_id: string; canonical_path: string } };


    const deniedRepair = await mutate(`/api/workspaces/${encodeURIComponent(added.workspace.workspace_id)}/path`, "PATCH", {
      workspace_path: repairedPath,
    });
    assert.equal(deniedRepair.status, 400);
    const repairResponse = await mutate(`/api/workspaces/${encodeURIComponent(added.workspace.workspace_id)}/path`, "PATCH", {
      workspace_path: repairedPath,
      user_confirmed: true,
    });
    assert.equal(repairResponse.status, 200);
    const repaired = await repairResponse.json() as { workspace: { workspace_id: string; canonical_path: string } };
    // Repair changes the folder relation only, and reports no Session count.
    assert.equal(Object.hasOwn(repaired, "updated_session_count"), false);
    await access(previousPath);
    await access(repairedPath);

    // RAC-215: a folder no longer starts a Session; the route that did is gone, confirmed or not.
    for (const body of [{ runtime_id: "claude-code" }, { runtime_id: "claude-code", title: "从工作目录启动", user_confirmed: true }]) {
      assert.equal((await mutate(`/api/workspaces/${encodeURIComponent(repaired.workspace.workspace_id)}/sessions`, "POST", body)).status, 404);
    }

    const unlinkResponse = await mutate(`/api/workspaces/${encodeURIComponent(repaired.workspace.workspace_id)}/unlink`, "POST", {
      user_confirmed: true,
    });
    assert.equal(unlinkResponse.status, 200);
    assert.deepEqual(await unlinkResponse.json(), { changed: true });

    const finalCatalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    assert.equal(finalCatalog.listWorkspaceDirectory(project.project_id).length, 0);
    assert.equal(finalCatalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
    finalCatalog.close();
    await access(previousPath);
    await access(repairedPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("folder membership and the browsing choice are project settings: they refuse folders of other projects", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-settings-"));
  const home = path.join(directory, ".molis-work");
  const folder = path.join(directory, "repository");
  await mkdir(folder, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "工作目录设置", actor_id: "user" });
  catalog.close();
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
    let key = 0;
    const call = (pathname: string, method: string, body?: Record<string, unknown>) => fetch(`${origin}${prefix}${pathname}`, {
      method, headers: { origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": `settings-${key++}` }, ...(body ? { body: JSON.stringify(body) } : {}) });

    const added = await call("/api/workspaces", "POST", { workspace_path: folder, user_confirmed: true });
    assert.equal(added.status, 201, await added.clone().text());
    const { workspace } = await added.json() as { workspace: { workspace_id: string } };

    const refused = await call("/api/project-settings/workspaces", "POST", { workspace_id: "workspace-of-another-project" });
    assert.equal(refused.status, 403);
    const chosen = await call("/api/project-settings/workspaces", "POST", { workspace_id: workspace.workspace_id });
    assert.equal(chosen.status, 200, await chosen.clone().text());
    assert.equal((await chosen.json() as { selected: string | null }).selected, workspace.workspace_id);
    assert.equal((await (await call("/api/project-settings/workspaces", "GET")).json() as { selected: string | null }).selected, workspace.workspace_id);
    const unknown = await call("/api/workspaces/workspace-unknown/unlink", "POST", { user_confirmed: true });
    assert.equal(unknown.status, 404);
    // The capability library lists them for the person who may run them, like any other action.
    const library = await (await fetch(`${origin}/capabilities/library?project=${encodeURIComponent(project.project_id)}`)).text();
    for (const title of ["关联工作目录", "修复工作目录路径", "解除工作目录", "选择浏览工作区"]) assert.ok(library.includes(title), `${title} is in the library`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
