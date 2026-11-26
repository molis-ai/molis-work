import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { readRoleVersion, resolveRoleCharacter } from "../apps/local-host/dist/characters-host.js";
import type { CharacterRoleCatalog } from "@molis-ai/molis-work-contracts/modules/characters";
import { renderCharacters, platformSurfaceClientScript } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

test("ROLE-01 ROLE-04 ROLE-07 ROLE-08 roles are saved, added to a project, frozen and listed through the real project routes without requiring Coding", async t => {
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
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(home, { recursive: true, force: true }); });
  const request = async (project: string, method: string, path: string, body?: unknown, authorized = true) => {
    const response = await fetch(`${origin}/projects/${project}/api/platform/characters${path}`, {
      method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  // RAC-459: the Assistant's picker in a project reads the same catalog the page does, through Characters' public action.
  const choices = async (project: string) => {
    const response = await fetch(`${origin}/projects/${project}/api/assistant/characters`, { headers: { origin, "x-molis-work-control-token": token } });
    assert.equal(response.status, 200); return (await response.json()).catalog as CharacterRoleCatalog;
  };
  const a = (method: string, path: string, body?: unknown, authorized = true) => request(first.project_id, method, path, body, authorized);
  const b = (method: string, path: string, body?: unknown) => request(second.project_id, method, path, body);
  const patch = { title: "证据核对 <script>", instructions: "先验证实际结果。\n未验证项目保留 UNVERIFIED。", host_tools: ["read-file", "search"] };
  assert.equal((await a("POST", "/drafts", patch, false)).status, 403);
  // ROLE-01: creating a role saves its first version at once.
  const created = await a("POST", "/drafts", { ...patch, owner_actor_id: "other" }); assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.version, 1);
  const id = created.body.draft.character_id, path = `/drafts/${id}`;
  // RAC-71: the Host's door answers what the person's action answers: a role that is not there and a body that is no object are 400.
  const missing = await a("POST", "/drafts/missing/state", { expected_revision: 1, state: "disabled" });
  assert.deepEqual([missing.status, missing.body.code], [400, "characters.not_found"]);
  const shapeless = await a("POST", path + "/state", [1]);
  assert.deepEqual([shapeless.status, shapeless.body.code], [400, "actions.input_invalid"]);
  // ROLE-04: a member in this project, both sections following the original.
  const added = await a("POST", "/members", { character_id: id }); assert.equal(added.status, 200, JSON.stringify(added.body));
  const member = added.body.role.current.member_id as string, choice = { kind: "project", member_id: member } as const;
  assert.equal(added.body.role.current.original.version, 1);
  const frozen = resolveRoleCharacter(home, "web-user", first.project_id, choice);
  assert.deepEqual([frozen.instructions, frozen.owner_actor_id, frozen.project_id], [patch.instructions, "web-user", first.project_id]);
  assert.throws(() => resolveRoleCharacter(home, "other-user", first.project_id, choice), /角色|不在/u, "another person never resolves this member");
  assert.throws(() => resolveRoleCharacter(home, "web-user", second.project_id, choice), /角色|不在/u, "a member of one project is not another project's role");
  // ROLE-07: editing the original saves version 2; the version a round froze reads back unchanged.
  const edited = await a("PUT", path, { ...patch, instructions: "新的做事方式", expected_revision: created.body.draft.revision });
  assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.version, 2);
  assert.equal((await a("PUT", path, { ...patch, expected_revision: created.body.draft.revision })).status, 409);
  assert.deepEqual(readRoleVersion(home, "web-user", first.project_id, frozen.version), frozen, "a saved version is never rewritten by a later edit");
  assert.equal(resolveRoleCharacter(home, "web-user", first.project_id, choice).instructions, "新的做事方式", "a new choice follows the original's newest version");
  // The picker lists the original and this project's member; another project has the original and no member.
  const offered = await choices(first.project_id);
  assert.deepEqual(offered.members.map(item => [item.role.current.member_id, item.title, item.availability.available]), [[member, patch.title, true]]);
  const elsewhere = await choices(second.project_id);
  assert.deepEqual([elsewhere.members.length, elsewhere.originals.map(item => item.ref.character_id)], [0, [id]]);
  // ROLE-08: a turned-off member is offered with Characters' reason and refused as a new choice, while a frozen version still reads.
  const turnedOff = await a("POST", `/members/${member}/state`, { expected_revision: added.body.role.revision, state: "disabled" });
  assert.equal(turnedOff.status, 200, JSON.stringify(turnedOff.body));
  assert.throws(() => resolveRoleCharacter(home, "web-user", first.project_id, choice));
  assert.deepEqual((await choices(first.project_id)).members.map(item => item.availability), [{ available: false, reason: "disabled" }]);
  assert.equal(readRoleVersion(home, "web-user", first.project_id, frozen.version).instructions, patch.instructions, "a running round keeps its version");
  // A fixed 成果 version is still the person's to publish from the role page, and survives a reopen.
  const published = await a("POST", path + "/publish", { expected_revision: edited.body.draft.revision, instructions: "forged", owner_actor_id: "other" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.publication.payload.instructions, "新的做事方式");
  assert.equal(published.body.publication.owner_actor_id, "web-user");
  assert.equal(published.body.publication.producer_plugin_id, "system.characters");
  // RAC-72: the Host writes the publication as the person, with the product version as producer version (CHR-1 D4).
  assert.equal(published.body.publication.producer_plugin_version, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
  const repeat = await a("POST", path + "/publish", { expected_revision: edited.body.draft.revision });
  assert.equal(repeat.status, 200); assert.equal(repeat.body.replayed, true);
  const publishedB = await b("POST", path + "/publish", { expected_revision: edited.body.draft.revision }); assert.equal(publishedB.status, 200, JSON.stringify(publishedB.body));
  assert.notEqual(publishedB.body.reference.artifact_id, published.body.reference.artifact_id);
  await new Promise<void>(resolve => server.close(() => resolve()));
  server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token }); origin = await start();
  const reopened = await a("GET", "/roles"); assert.equal(reopened.status, 200);
  assert.deepEqual([reopened.body.originals[0].version, reopened.body.members[0].availability.available], [2, false]);
  // Deleting the original removes its versions from new and running rounds alike.
  assert.equal((await a("POST", path + "/state", { expected_revision: edited.body.draft.revision, state: "tombstoned" })).status, 200);
  assert.throws(() => readRoleVersion(home, "web-user", first.project_id, frozen.version), /已不在/u);
  // Plan C: the project's roles page is 项目设置 › 角色, embedded in project settings.
  const page = await fetch(`${origin}/projects/${first.project_id}/settings/characters?embed=1`, { headers: { "x-molis-work-control-token": token } }); assert.equal(page.status, 200);
  const html = await page.text(); assert.ok(html.includes('data-settings-panel="characters"')); assert.ok(html.includes('data-character-api="/projects/' + first.project_id));
});

test("Character manager client parses and its server-rendered route is escaped", () => {
  // RAC-69: the bundled client parses, and registers the surface's factory with the workbench's deferred loader (CHR-1).
  const client = platformSurfaceClientScript("/assets/molis-work-plugins/characters.js");
  assert.doesNotThrow(() => new Function(client)); assert.match(client, /molisWorkbenchPluginFactories/);
  const html = renderCharacters({ route_prefix: '/projects/"<script>', primitives: { escape: value => escapeHtml(String(value)) } });
  assert.ok(!html.includes('/projects/"<script>'));
  assert.ok(html.includes('data-character-drawer'));
});
