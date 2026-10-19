// The after-write checkers in the project's settings (specs/prologue-adoption §6.0p.12): PA-40, PA-41, PA-42. The page's
// requests go through the public web server, with the same local control guard in front; what may be saved is the action's
// to say (tests/coding-checkers-settings.test.ts), so here the route only has to carry it there and back unchanged.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDesktopWebHost, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { writeCheckerFieldsOf, writeCheckerFromFields, writeCheckersAfter } from "@molis-ai/molis-work-app-workbench";
import type { AgentWriteChecker, AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";

const TOKEN = "write-checkers-settings-token-0123456789";
const ROUTE = "/api/project-settings/write-checkers";
const NODE: AgentWriteChecker = { checker_id: "node", display_name: "Node 语法", executable: "node", args: ["--check", "{file}"], applies_to: [".js"] };

/** A throwaway Home with two projects, each linking its own folder through the same requests the settings page makes. */
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "write-checkers-settings-"));
  const home = join(directory, ".molis-work");
  await mkdir(join(directory, "app")); await mkdir(join(directory, "other"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "写后检查设置", actor_id: "user" });
  const neighbour = await catalog.createProject({ display_name: "隔壁项目", actor_id: "user" });
  catalog.close();
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let key = 0;
  const request = async (projectId: string, path: string, body?: unknown, token: string | null = TOKEN) => {
    const headers: Record<string, string> = { origin, accept: "application/json", "x-molis-work-idempotency-key": `write-checkers-${++key}` };
    if (token) headers["x-molis-work-control-token"] = token;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${origin}/projects/${encodeURIComponent(projectId)}${path}`, { method: body === undefined ? "GET" : "POST", headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, type: response.headers.get("content-type") ?? "", text, body: /json/.test(response.headers.get("content-type") ?? "") ? JSON.parse(text) as Record<string, unknown> : null };
  };
  const link = async (projectId: string, folder: string) => {
    const linked = await request(projectId, "/api/workspaces", { workspace_path: join(directory, folder), user_confirmed: true });
    assert.equal(linked.status, 201, linked.text);
    return (linked.body as { workspace: { workspace_id: string } }).workspace.workspace_id;
  };
  return {
    project: project.project_id, neighbour: neighbour.project_id, request, link,
    lists: async () => ((await request(project.project_id, ROUTE)).body as { lists: AgentWriteCheckerList[] }).lists,
    save: (body: unknown, token: string | null = TOKEN) => request(project.project_id, ROUTE, body, token),
    async close() { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); },
  };
}

test("PA-40 the workspaces settings page has the after-write checks, one group per folder this project has authorized", { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const page = await f.request(f.project, "/settings/workspaces");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-write-checkers>/);
    for (const name of ["display_name", "executable", "args", "applies_to", "cwd", "timeout_seconds"]) assert.match(page.text, new RegExp(`name="${name}"`), name);
    assert.deepEqual(await f.lists(), [], "no folder linked yet: no group");

    const app = await f.link(f.project, "app");
    const other = await f.link(f.neighbour, "other");
    assert.deepEqual(await f.lists(), [{ workspace_id: app, version: 0, checkers: [] }], "the neighbour's folder is not this project's");
    const foreign = await f.save({ workspace_id: other, expected_version: 0, checkers: [NODE] });
    assert.equal(foreign.status, 400, foreign.text);
    assert.equal(foreign.body?.code, "agent.directory_unauthorized");

    assert.equal((await f.save({ workspace_id: app, expected_version: 0, checkers: [NODE] })).status, 200);
    const unlinked = await f.request(f.project, `/api/workspaces/${encodeURIComponent(app)}/unlink`, { user_confirmed: true });
    assert.equal(unlinked.status, 200, unlinked.text);
    assert.deepEqual(await f.lists(), [], "a folder taken back has no group");
    const refused = await f.save({ workspace_id: app, expected_version: 1, checkers: [] });
    assert.equal(refused.status, 400, refused.text);
    assert.equal(refused.body?.code, "agent.directory_unauthorized");
  } finally { await f.close(); }
});

test("PA-41 the page saves through the route against the version read; a stale or invalid save and one without the token change nothing", { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const app = await f.link(f.project, "app");
    const first = await f.save({ workspace_id: app, expected_version: 0, checkers: [NODE] });
    assert.equal(first.status, 200, first.text);
    const kept = { ...NODE, cwd: ".", timeout_ms: 30_000 };
    assert.deepEqual(first.body, { workspace_id: app, version: 1, checkers: [kept] });

    const stale = await f.save({ workspace_id: app, expected_version: 0, checkers: [] });
    assert.equal(stale.status, 409, stale.text);
    assert.equal(stale.body?.code, "actions.conflict");

    const invalid = await f.save({ workspace_id: app, expected_version: 1, checkers: [{ ...NODE, args: ["--check"] }] });
    assert.equal(invalid.status, 400, invalid.text);
    assert.equal(invalid.body?.code, "agent.write_checker_invalid");
    assert.match(JSON.stringify(invalid.body), /检查器「Node 语法」的参数里要有一个、也只能有一个 \{file\}/, "the action's own words reach the page");

    const bare = await f.save({ workspace_id: app, expected_version: 1, checkers: [] }, null);
    assert.equal(bare.status, 403, bare.text);
    assert.equal(bare.body?.code, "host.request_refused", "the local control guard refuses it before the route");
    assert.deepEqual(await f.lists(), [{ workspace_id: app, version: 1, checkers: [kept] }], "nothing refused was kept");

    const second = await f.save({ workspace_id: app, expected_version: 1, checkers: [] });
    assert.equal(second.status, 200, second.text);
    assert.equal((second.body as AgentWriteCheckerList | null)?.version, 2);
  } finally { await f.close(); }
});

test("PA-42 the form becomes the contract's shape, and a row's button changes only its own checker", () => {
  const fields = { display_name: " Biome ", executable: "Biome", args: "check --title \"two words\" \"\" {file}", applies_to: "js, .mjs，ts .js", cwd: " src ", timeout_seconds: "2.5" };
  const checker = writeCheckerFromFields(fields, ["biome", "biome-2"], null);
  assert.deepEqual(checker, { checker_id: "biome-3", display_name: "Biome", executable: "Biome", args: ["check", "--title", "two words", "", "{file}"],
    applies_to: [".js", ".mjs", ".ts"], cwd: "src", timeout_ms: 2500 });
  assert.deepEqual(writeCheckerFromFields({ ...fields, cwd: "", timeout_seconds: " " }, ["biome"], "kept-id"),
    { checker_id: "kept-id", display_name: "Biome", executable: "Biome", args: checker.args, applies_to: checker.applies_to },
    "a change keeps its id; an empty folder and time are left to the action's defaults");
  assert.equal(writeCheckerFromFields({ ...fields, executable: "-./" }, [], null).checker_id, "checker");

  const kept = { ...checker, cwd: "src", timeout_ms: 2500 };
  assert.deepEqual(writeCheckerFieldsOf(kept), { display_name: "Biome", executable: "Biome", args: "check --title \"two words\" \"\" {file}", applies_to: ".js .mjs .ts", cwd: "src", timeout_seconds: "2.5" });
  assert.deepEqual(writeCheckerFromFields(writeCheckerFieldsOf(kept), [], kept.checker_id), kept, "a checker read back and saved unchanged is the same checker");
  assert.deepEqual(writeCheckerFromFields({ ...fields, args: "--check" }, [], null).args, ["--check"], "no {file}: the page does not refuse, the action does");

  const a = { ...NODE, checker_id: "a" }, b = { ...NODE, checker_id: "b" }, c = { ...NODE, checker_id: "c" };
  assert.deepEqual(writeCheckersAfter([a, b, c], "c", "up"), [a, c, b]);
  assert.deepEqual(writeCheckersAfter([a, b, c], "a", "up"), [a, b, c]);
  assert.deepEqual(writeCheckersAfter([a, b, c], "b", "remove"), [a, c]);
  const changed = { ...b, display_name: "改过" };
  assert.deepEqual(writeCheckersAfter([a, b, c], "b", changed), [a, changed, c]);
  assert.deepEqual(writeCheckersAfter([a, b], null, c), [a, b, c]);
});
