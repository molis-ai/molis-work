import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { freezeProjectCharacter } from "../apps/local-host/src/characters-host.ts";
import { CHARACTERS_CLIENT_FACTORY_SCRIPT, renderCharacters } from "@molis-ai/molis-work-plugin-characters";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("Character manager publishes confirmed personal drafts through real project Artifact routes without requiring Coding", async t => {
  const home = mkdtempSync(join(tmpdir(), "characters-http-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "角色发布", actor_id: "web-user" });
  const second = await catalog.createProject({ display_name: "角色复用", actor_id: "web-user" });
  assert.equal(catalog.listProjectPlugins(first.project_id).includes("coding"), false);
  catalog.close();
  const token = "character-test-control-token-123456789";
  let server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  const start = async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string"); return `http://127.0.0.1:${address.port}`;
  };
  let origin = await start();
  const database = new LocalProjectDatabase(first.database_path), artifacts = new GoalProjectApplication(database).artifacts.query;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); rmSync(home, { recursive: true, force: true }); });
  const request = async (project: string, method: string, path: string, body?: unknown, authorized = true) => {
    const response = await fetch(`${origin}/projects/${project}/api/plugins/io.molis.work.characters${path}`, {
      method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const a = (method: string, path: string, body?: unknown, authorized = true) => request(first.project_id, method, path, body, authorized);
  const b = (method: string, path: string, body?: unknown) => request(second.project_id, method, path, body);
  assert.equal((await a("POST", "/drafts", {}, false)).status, 403);
  const created = await a("POST", "/drafts", {}); assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.draft.character_id, path = `/drafts/${id}`;
  assert.equal((await a("POST", path + "/publish", { expected_revision: 1 })).status, 400);
  const patch = { title: "证据核对 <script>", instructions: "先验证实际结果。\n未验证项目保留 UNVERIFIED。", host_tools: ["read-file", "search"] };
  const edited = await a("PUT", path, { ...patch, expected_revision: 1 }); assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal((await a("PUT", path, { ...patch, expected_revision: 1 })).status, 409);
  assert.equal((await a("POST", path + "/publish", { expected_revision: 1 })).status, 409);
  const published = await a("POST", path + "/publish", { expected_revision: 2, instructions: "forged", owner_actor_id: "other" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.publication.payload.instructions, patch.instructions);
  assert.equal(published.body.publication.owner_actor_id, "web-user");
  assert.equal(published.body.publication.producer_plugin_id, "io.molis.work.characters");
  assert.equal(published.body.publication.board_id, first.board_id);
  assert.equal(published.body.reference.version, 1);
  const frozen = freezeProjectCharacter(home, "web-user", first.board_id, artifacts, published.body.reference);
  assert.equal(frozen.instructions, patch.instructions);
  assert.throws(() => freezeProjectCharacter(home, "other-user", first.board_id, artifacts, published.body.reference), /不可用/);
  assert.throws(() => freezeProjectCharacter(home, "web-user", second.board_id, artifacts, published.body.reference), /不可用/);
  assert.throws(() => freezeProjectCharacter(home, "web-user", first.board_id, artifacts, { ...published.body.reference, version: 99 }), /不可用/);
  const repeat = await a("POST", path + "/publish", { expected_revision: 2 });
  assert.equal(repeat.status, 200); assert.equal(repeat.body.replayed, true); assert.deepEqual(repeat.body.publication, published.body.publication);
  const inSecond = await b("GET", "/drafts"); assert.equal(inSecond.status, 200); assert.equal(inSecond.body.drafts[0].character_id, id); assert.deepEqual(inSecond.body.publications, []);
  const publishedB = await b("POST", path + "/publish", { expected_revision: 2 }); assert.equal(publishedB.status, 200, JSON.stringify(publishedB.body));
  assert.notEqual(publishedB.body.reference.artifact_id, published.body.reference.artifact_id);
  assert.equal(publishedB.body.publication.board_id, second.board_id);
  assert.equal((await a("PUT", path, { ...patch, instructions: "新的做事方式", expected_revision: 2 })).status, 200);
  assert.deepEqual(freezeProjectCharacter(home, "web-user", first.board_id, artifacts, published.body.reference), frozen, "editing a draft does not silently replace an explicitly selected old publication");
  const next = await a("POST", path + "/publish", { expected_revision: 3 }); assert.equal(next.status, 200); assert.equal(next.body.reference.version, 2);
  assert.equal(next.body.publication.supersedes_version, 1);
  const state = await a("GET", "/drafts"); assert.equal(state.body.publications.length, 2);
  assert.deepEqual(state.body.publications.find((item: { version: number }) => item.version === 1), published.body.publication);
  assert.equal((await a("POST", path + "/state", { expected_revision: 3, state: "disabled" })).status, 200);
  assert.throws(() => freezeProjectCharacter(home, "web-user", first.board_id, artifacts, published.body.reference), /停用/);
  assert.equal(frozen.instructions, patch.instructions, "an existing frozen Run does not re-resolve the disabled profile");
  assert.equal((await b("POST", path + "/publish", { expected_revision: 4 })).status, 400);
  assert.equal((await a("POST", path + "/state", { expected_revision: 4, state: "active" })).status, 200);
  await new Promise<void>(resolve => server.close(() => resolve()));
  server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token }); origin = await start();
  const reopened = await a("GET", "/drafts"); assert.equal(reopened.status, 200); assert.equal(reopened.body.drafts[0].revision, 5);
  assert.deepEqual(reopened.body.publications, state.body.publications);
  assert.equal((await a("POST", path + "/state", { expected_revision: 5, state: "tombstoned" })).status, 200);
  assert.throws(() => freezeProjectCharacter(home, "web-user", first.board_id, artifacts, published.body.reference), /删除/);
  assert.equal((await b("POST", path + "/publish", { expected_revision: 6 })).status, 400);
  assert.equal((await b("GET", "/drafts")).body.publications.length, 1, "deletion preserves the project's historical fixed publication");
  const page = await fetch(`${origin}/projects/${first.project_id}/`); assert.equal(page.status, 200);
  const html = await page.text(); assert.ok(html.includes('data-work-surface="characters"')); assert.ok(html.includes('data-character-api="/projects/' + first.project_id));
});

test("Character manager client parses and its server-rendered route is escaped", () => {
  assert.equal(typeof new Function(`return (${CHARACTERS_CLIENT_FACTORY_SCRIPT})`)(), "function");
  const html = renderCharacters({ route_prefix: '/projects/"<script>', primitives: { escape: value => escapeHtml(String(value)) } });
  assert.ok(!html.includes('/projects/"<script>'));
  assert.ok(html.includes('data-character-dialog'));
});
