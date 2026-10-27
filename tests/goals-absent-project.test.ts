import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { takeBackGoals } from "./fixtures/goals-agreement.js";

// ac-trust T3b (RAC-400, specs/repository-anti-corruption/slices/ac-trust-install.md §3.4.1): the person takes back the agreement that keeps Goals
// in every project, and a project made after that has no Goals. Its pages draw and answer with the plugin list, home and links as for any other plugin that is not on (Goals' stage and dialogs stay
// in the page's hidden pool, which the one workbench program binds), and nothing says "internal error" or opens a Goal view; a project that still has Goals is drawn as before.

async function withoutGoals(t: Parameters<typeof test>[1] extends (t: infer T, ...rest: never[]) => unknown ? T : never) {
  const home = await mkdtemp(join(tmpdir(), "goals-absent-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  takeBackGoals(home);
  const project = await catalog.createProject({ display_name: "没有 Goals", actor_id: "test" });
  assert.equal(catalog.listProjectPlugins(project.project_id).includes("goals"), false, "the project has no Goals");
  // The server builds its own Host, with the catalog policy for which plugins a project's actions may reach, as the app's does.
  const controlToken = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    catalog.close(); await rm(home, { recursive: true, force: true });
  });
  return { home, project, controlToken, origin: `http://127.0.0.1:${address.port}`, prefix: `http://127.0.0.1:${address.port}/projects/${project.project_id}` };
}

test("RAC-400 a project without Goals draws its page, its settings and its board, and does not offer Goals", { timeout: 240_000 }, async t => {
  const env = await withoutGoals(t);
  for (const path of ["", "/settings", "/settings/plugins", "/settings/guidance", "/api/board", "/api/capsule"]) {
    const response = await fetch(env.prefix + path);
    const text = await response.text();
    assert.equal(response.status, 200, `${path || "/"}: ${text.slice(0, 300)}`);
    assert.doesNotMatch(text, /internal error|内部错误/i, path || "/");
  }
  const page = await fetch(env.prefix).then(response => response.text());
  assert.match(page, /data-desktop-surface="home"/, "the page opens on the project's home");
  // The plugin list carries the Host's marks: with the agreement taken back, Goals is one to add again (a tile "not added"), never one the
  // project has, and there is no link into it.
  assert.match(page, /class="plugin-rail-tile is-available" data-plugin-tile="goals"/, "Goals is one to add, not one the project has");
  assert.doesNotMatch(page, /class="plugin-rail-tile(?: is-kept)?" data-plugin-tile="goals"|data-plugin-id="goals"/, "the project's plugin list does not hold Goals");
  const settings = await fetch(`${env.prefix}/settings/guidance`).then(response => response.text());
  assert.equal(/class="guidance-document"|<a href="[^"]*\/settings\/guidance"/.test(settings), false, "the project description page is Goals', so a project without Goals neither lists nor draws it");
  // A link to a Goal that is not there is answered as not found, never as a failure.
  const linked = await fetch(`${env.prefix}/goals/goal-x`);
  assert.ok(linked.status < 500, `a Goal link in a project without Goals: ${linked.status}`);
});

test("RAC-400 the management entry refuses an unregistered Goals tool as missing and creates no Goals facts", { timeout: 240_000 }, async t => {
  const env = await withoutGoals(t);
  const goalFacts = () => {
    const db = new DatabaseSync(env.project.database_path, { readOnly: true });
    try {
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
      return Object.fromEntries(["boards", "goals"].map(table => [table, tables.has(table) ? db.prepare(`SELECT * FROM ${table}`).all() : null]));
    } finally { db.close(); }
  };
  const before = goalFacts();
  assert.equal(before.boards?.length ?? 0, 0);
  assert.equal(before.goals?.length ?? 0, 0);
  const post = async (capability: { capability_id: string; version: number }, input: unknown) => {
    const response = await fetch(env.origin + "/api/internal/management-action", { method: "POST", headers: { origin: env.origin, "content-type": "application/json",
      "x-molis-work-control-token": env.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ home_id: createHash("sha256").update(resolve(env.home)).digest("hex"), database_path: env.project.database_path,
      project_id: env.project.project_id, call_id: randomUUID(), capability, input }) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const refused = await post({ capability_id: "goals.board.initialize", version: 2 }, { idempotency_key: randomUUID() });
  assert.equal(refused.body.code, "actions.missing", JSON.stringify(refused.body));
  assert.ok(refused.status >= 400 && refused.status < 500, `a refusal the caller can read, not a failure: ${refused.status}`);
  assert.deepEqual(goalFacts(), before, "the refused initialize created no Goal table, board or Goal fact");
});
