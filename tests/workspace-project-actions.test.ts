import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-workspace-actions-token-0123456789";

test("project workspace actions require confirmation, repair matching Sessions, launch, and unlink without touching files", async () => {
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

    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    const existingSession = registry.createSession({
      runtime_id: "claude-code",
      actor_id: "user",
      user_confirmed: true,
      project_id: project.project_id,
      workspace_id: added.workspace.workspace_id,
      workspace_path: added.workspace.canonical_path,
      title: "需要随路径修复的 Session",
    });
    const conflictingSession = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      project_id: project.project_id,
      workspace_id: "workspace-historical-conflict",
      workspace_path: added.workspace.canonical_path,
      title: "历史目录身份冲突",
    });
    registry.close();

    const conflictPage = await (await fetch(`${origin}${prefix}/`)).text();
    assert.match(conflictPage, /关联冲突/);
    const conflictLaunch = await mutate(`/api/workspaces/${encodeURIComponent(added.workspace.workspace_id)}/sessions`, "POST", {
      runtime_id: "codex",
      user_confirmed: true,
    });
    assert.equal(conflictLaunch.status, 409);

    const deniedRepair = await mutate(`/api/workspaces/${encodeURIComponent(added.workspace.workspace_id)}/path`, "PATCH", {
      workspace_path: repairedPath,
    });
    assert.equal(deniedRepair.status, 400);
    const repairResponse = await mutate(`/api/workspaces/${encodeURIComponent(added.workspace.workspace_id)}/path`, "PATCH", {
      workspace_path: repairedPath,
      user_confirmed: true,
    });
    assert.equal(repairResponse.status, 200);
    const repaired = await repairResponse.json() as { workspace: { workspace_id: string; canonical_path: string }; updated_session_count: number };
    assert.equal(repaired.updated_session_count, 2);

    const afterRepair = await openWorkSessionRegistry({ homeDirectory: home });
    assert.equal(afterRepair.get(existingSession.session_id).workspace_path, repaired.workspace.canonical_path);
    assert.equal(afterRepair.get(conflictingSession.session_id).workspace_id, repaired.workspace.workspace_id);
    afterRepair.close();
    await access(previousPath);
    await access(repairedPath);

    const deniedLaunch = await mutate(`/api/workspaces/${encodeURIComponent(repaired.workspace.workspace_id)}/sessions`, "POST", {
      runtime_id: "claude-code",
    });
    assert.equal(deniedLaunch.status, 400);
    const launchResponse = await mutate(`/api/workspaces/${encodeURIComponent(repaired.workspace.workspace_id)}/sessions`, "POST", {
      runtime_id: "claude-code",
      title: "从工作目录启动",
      user_confirmed: true,
    });
    assert.equal(launchResponse.status, 201);
    const launched = await launchResponse.json() as { session: { session_id: string; workspace_path: string; project_id: string } };
    assert.equal(launched.session.workspace_path, repaired.workspace.canonical_path);
    assert.equal(launched.session.project_id, project.project_id);

    const unlinkResponse = await mutate(`/api/workspaces/${encodeURIComponent(repaired.workspace.workspace_id)}/unlink`, "POST", {
      user_confirmed: true,
    });
    assert.equal(unlinkResponse.status, 200);
    const unlink = await unlinkResponse.json() as { updated_session_count: number };
    assert.equal(unlink.updated_session_count, 3);

    const finalCatalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    assert.equal(finalCatalog.listWorkspaceDirectory(project.project_id).length, 0);
    assert.equal(finalCatalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
    finalCatalog.close();
    const finalRegistry = await openWorkSessionRegistry({ homeDirectory: home });
    assert.equal(finalRegistry.get(existingSession.session_id).workspace_path, null);
    assert.equal(finalRegistry.get(conflictingSession.session_id).workspace_path, null);
    assert.equal(finalRegistry.get(launched.session.session_id).workspace_path, null);
    finalRegistry.close();
    await access(previousPath);
    await access(repairedPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
