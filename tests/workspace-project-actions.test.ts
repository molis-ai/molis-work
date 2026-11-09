import { MolisWorkLocalHost, projectActionAvailability, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, realpath, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

async function catalogWebHost(homeDirectory: string) {
  let withCatalog = withMolisWorkProjectCatalog;
  const availability = projectActionAvailability((options, run) => withCatalog(options, run), homeDirectory);
  const host = new MolisWorkLocalHost({ homeDirectory,
    actionAvailability: availability, sceneAvailability: availability,
    projectRoutePrefix: projectId => `/projects/${encodeURIComponent(projectId)}`,
    workspacesFor: projectId => withCatalog({ homeDirectory }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withCatalog({ homeDirectory }, catalog => workspaceRefFor(catalog, projectId)),
  });
  const access = host.ensureWebCatalog(homeDirectory, openMolisWorkProjectCatalog);
  withCatalog = host.configurePersonalPlanning(homeDirectory, access.withCatalog);
  return { host, withCatalog, catalog: await withCatalog({ homeDirectory }, current => current) };
}

const TOKEN = "molis-work-workspace-actions-token-0123456789";

type Directories = { directories: Array<{ workspace_id: string; canonical_path: string; roles: string[]; state: string }>; revision: string };

// SSC-03 (a change commits from the revision read), SSC-16 (repair only of a missing folder, the id kept), SSC-05 (the browsing routes are
// gone): the project's folders change only through `projects.directories.*`, and no change touches a file.
test("project directory changes commit from the revision read, repair only a missing folder and remove only the folder relation, and touch no files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-actions-"));
  const home = path.join(directory, ".molis-work");
  const previousPath = path.join(directory, "repository-before");
  const movedPath = path.join(directory, "repository-moved");
  const repairedPath = path.join(directory, "repository-after");
  await mkdir(previousPath, { recursive: true });
  await mkdir(repairedPath, { recursive: true });
  const { host, catalog, withCatalog } = await catalogWebHost(home);
  const project = await catalog.createProject({ display_name: "工作目录动作", actor_id: "user" });

  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
    let key = 0;
    const mutate = (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${prefix}${pathname}`, {
      method,
      headers: {
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": `workspace-test-${key++}`,
      },
      body: JSON.stringify(body),
    });
    const read = async () => {
      const response = await fetch(`${origin}${prefix}/api/project-settings/directories`, { headers: { origin, "x-molis-work-control-token": TOKEN } });
      assert.equal(response.status, 200);
      return await response.json() as Directories;
    };
    const change = (name: string, input: Record<string, unknown>) => mutate("/api/project-settings/directories", "POST", { change: name, input });

    // The routes that linked, repaired, unlinked or chose a browsing folder are gone; their changes are `projects.directories.*`.
    for (const [pathname, method] of [["/api/workspaces", "POST"], ["/api/project-settings/workspaces", "POST"],
      ["/api/workspaces/any/path", "PATCH"], ["/api/workspaces/any/unlink", "POST"]] as const) {
      assert.equal((await mutate(pathname, method, { workspace_path: previousPath, user_confirmed: true })).status, 404, `${method} ${pathname}`);
    }

    const initial = await read();
    const output = initial.directories.filter(item => item.roles.includes("output"));
    assert.equal(output.length, 1, "a new project has exactly its default output directory");
    // A change without the revision the person read is refused, and so is one from a revision that is no longer current.
    assert.equal((await change("add_input", { workspace_path: previousPath })).status, 400);
    assert.equal((await change("add_input", { workspace_path: previousPath, expected_revision: "stale" })).status, 409);
    assert.deepEqual(await read(), initial, "a refused change writes nothing");
    const addedResponse = await change("add_input", { workspace_path: previousPath, expected_revision: initial.revision });
    assert.equal(addedResponse.status, 200, await addedResponse.clone().text());
    const added = await addedResponse.json() as Directories;
    const linked = added.directories.find(item => item.roles.includes("input"));
    assert.ok(linked);
    assert.deepEqual(linked.roles, ["input"]);

    // A folder still where it was is not repaired.
    const present = await change("repair", { workspace_id: linked.workspace_id, workspace_path: repairedPath, expected_revision: added.revision });
    assert.equal(present.status, 400, await present.clone().text());
    // The person moves the folder; it reads missing, and repair finds it again under the same id.
    await rename(previousPath, movedPath);
    const missing = await read();
    assert.equal(missing.directories.find(item => item.workspace_id === linked.workspace_id)?.state, "missing");
    const nowhere = await change("repair", { workspace_id: linked.workspace_id, workspace_path: path.join(directory, "nowhere"), expected_revision: missing.revision });
    assert.equal(nowhere.status, 404, await nowhere.clone().text());
    const repairResponse = await change("repair", { workspace_id: linked.workspace_id, workspace_path: repairedPath, expected_revision: missing.revision });
    assert.equal(repairResponse.status, 200, await repairResponse.clone().text());
    const repaired = (await repairResponse.json() as Directories).directories.find(item => item.workspace_id === linked.workspace_id);
    assert.ok(repaired);
    assert.equal(repaired.state, "ok");
    assert.equal(repaired.canonical_path, await realpath(repairedPath));
    await access(movedPath);
    await access(repairedPath);

    // RAC-215: a folder no longer starts a Session; the route that did is gone, confirmed or not.
    for (const body of [{ runtime_id: "claude-code" }, { runtime_id: "claude-code", title: "从工作目录启动", user_confirmed: true }]) {
      assert.equal((await mutate(`/api/workspaces/${encodeURIComponent(linked.workspace_id)}/sessions`, "POST", body)).status, 404);
    }

    const before = await read();
    const removeResponse = await change("remove_input", { workspace_id: linked.workspace_id, expected_revision: before.revision });
    assert.equal(removeResponse.status, 200, await removeResponse.clone().text());

    await withCatalog({ homeDirectory: home }, finalCatalog => {
      const directories = finalCatalog.projectDirectories(project.project_id).directories;
      assert.deepEqual(directories.map(item => item.workspace_id), [output[0]!.workspace_id], "only the default output directory is left");
      assert.deepEqual(directories[0]!.roles, ["output"]);
    });
    await access(movedPath);
    await access(repairedPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// SSC-03: one output, which a folder of the project can also be; SSC-22: another project's default output directory is refused.
test("project directories are project settings: they refuse folders of other projects", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-settings-"));
  const home = path.join(directory, ".molis-work");
  const folder = path.join(directory, "repository");
  await mkdir(folder, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "工作目录设置", actor_id: "user" });
  const other = await catalog.createProject({ display_name: "另一个项目", actor_id: "user" });
  const othersOutput = catalog.outputDirectory(other.project_id).canonical_path;
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

    const read = async () => (await (await call("/api/project-settings/directories", "GET")).json()) as Directories;
    const change = (name: string, input: Record<string, unknown>) => call("/api/project-settings/directories", "POST", { change: name, input });
    const first = await read();
    const added = await change("add_input", { workspace_path: folder, expected_revision: first.revision });
    assert.equal(added.status, 200, await added.clone().text());
    const linked = await added.json() as Directories;
    const workspace = linked.directories.find(item => item.roles.includes("input"));
    assert.ok(workspace);

    // A folder that is not this project's is not made its output, or removed from it.
    const refused = await change("set_output", { workspace_id: "workspace-of-another-project", expected_revision: linked.revision });
    assert.equal((await refused.json() as { code?: string }).code, "catalog.context.workspace_membership_not_found", String(refused.status));
    const unknown = await change("remove_input", { workspace_id: "workspace-unknown", expected_revision: linked.revision });
    assert.equal((await unknown.json() as { code?: string }).code, "catalog.context.workspace_membership_not_found", String(unknown.status));
    // Another project's default output directory cannot be linked here, as an input or as the output (SSC-22).
    for (const name of ["add_input", "set_output"]) {
      const response = await change(name, { workspace_path: othersOutput, expected_revision: linked.revision });
      assert.equal((await response.clone().json() as { code?: string }).code, "projects.directory_duplicate", `${name}: ${response.status}`);
    }
    assert.deepEqual(await read(), linked, "the refusals write nothing");
    const chosen = await change("set_output", { workspace_id: workspace.workspace_id, expected_revision: linked.revision });
    assert.equal(chosen.status, 200, await chosen.clone().text());
    const after = await chosen.json() as Directories;
    assert.deepEqual(after.directories.filter(item => item.roles.includes("output")).map(item => item.workspace_id), [workspace.workspace_id]);
    assert.deepEqual(after.directories.find(item => item.workspace_id === workspace.workspace_id)?.roles, ["input", "output"]);
    // BL-372: the project's Runtime pick is the same kind of setting. No pick is the Home default; a pick that is not offered is kept and
    // reported with its name, so it can be changed or put back; only a Runtime id or null is a pick.
    const picked = async (body?: Record<string, unknown>) => (await call("/api/project-settings/runtime", body ? "POST" : "GET", body)).json() as Promise<{ runtimes: Array<{ runtime_id: string }>; selected: string | null; problem: string | null }>;
    const initial = await picked();
    assert.deepEqual([initial.selected, initial.problem], [null, null]);
    assert.ok(initial.runtimes.length >= 1, "the Runtimes that can host a session are listed");
    const gone = await picked({ runtime_id: "gone-engine" });
    assert.equal(gone.selected, "gone-engine");
    assert.match(gone.problem ?? "", /gone-engine.*项目设置/);
    assert.equal((await call("/api/project-settings/runtime", "POST", { runtime_id: 5 })).status, 400);
    assert.deepEqual([(await picked({ runtime_id: null })).selected, (await picked()).problem], [null, null]);
    // The capability library lists them for the person who may run them, like any other action.
    const library = await (await fetch(`${origin}/capabilities/library?project=${encodeURIComponent(project.project_id)}`)).text();
    for (const title of ["项目目录", "添加输入目录", "移除输入目录", "设置输出目录", "修复目录路径", "选择项目运行时"]) assert.ok(library.includes(title), `${title} is in the library`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
