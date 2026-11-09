import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  PROJECT_WORKSPACE_PROVIDER_ID,
  projectPluginActions,
  type ProjectPluginRegistry,
  type VersionedProjectPluginMembership,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { bindActionHandler, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createProjectsSchema, projectReplicationOwner, ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { openSqliteConnection, sqliteErrorName, type SqliteDatabase } from "@molis-ai/molis-work-storage";

const projectId = "project-a";
const otherProjectId = "project-b";
const actorId = "user-1";
const registry: ProjectPluginRegistry = {
  has: id => ["goals", "feed", "inbox", "pages", "personal"].includes(id),
  alwaysOn: () => ["goals"],
  companions: id => id === "feed" ? ["inbox"] : [],
  isPersonal: id => id === "personal",
};

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-membership-"));
  const filename = join(directory, "catalog.db");
  const connections: SqliteDatabase[] = [];
  t.after(() => {
    for (const db of connections) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let now = "2026-11-08T01:00:00.000Z";
  let sequence = 9999;
  const open = (plugins = registry) => {
    const db = openSqliteConnection(filename, { timeout: 0 });
    connections.push(db);
    db.pragma("foreign_keys = ON");
    const projects = new ProjectsModule({
      db, plugins, projects_directory: directory, outputs_directory: join(directory, "outputs"),
      now: () => now,
      id: prefix => `${prefix}-${sequence--}`,
    });
    const get = (project = projectId) => projects.query.projectPluginMembershipWithRevision(project);
    const set = (plugin_id: string, enabled: boolean, expected_revision: string) =>
      projects.commands.setProjectPlugin(projectId, actorId, { plugin_id, enabled, expected_revision });
    return { db, projects, get, set };
  };
  const first = open();
  first.db.pragma("journal_mode = WAL");
  createProjectsSchema(first.db);
  for (const id of [projectId, otherProjectId]) {
    first.projects.lifecycle.register(
      first.projects.lifecycle.prepareRecord({ project_id: id, display_name: id, data_class: "user" }),
      "project.created",
      actorId,
    );
  }
  const events = (db = first.db) => db.prepare<[], { project_id: string; actor_id: string; type: string; plugin_id: string }>(`
    SELECT project_id, actor_id, type, json_extract(payload_json, '$.plugin_id') AS plugin_id
    FROM project_events
    WHERE type IN ('project.plugin_added', 'project.plugin_removed')
    ORDER BY rowid
  `).all();
  const portable = projectReplicationOwner(first.db, { spaceId: "personal:test", authorize: () => {}, excludedProjectIds: [] });
  return { ...first, open, events, portable, setTime: (time: string) => { now = time; } };
}

test("SPC-C08 the declared actions validate caller and input, then read and write the same owner state", async t => {
  const f = fixture(t);
  const { get, set } = projectPluginActions;
  const service = new ActionService();
  // Test composition through the public Kernel and owner, independent of the Host settings route.
  const dispose = service.registerProvider({
    provider: { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目插件成员", kind: "system", project_id: projectId },
    definitions: [get, set],
    handlers: [
      bindActionHandler(get, (_, caller) => f.get(caller.project_id!)),
      bindActionHandler(set, async (input, caller) => {
        await caller.beforeEffect();
        return f.projects.commands.setProjectPlugin(caller.project_id!, caller.actor_id, input);
      }),
    ],
  });
  t.after(dispose);
  const person: ActionCallContext = { project_id: projectId, actor_id: actorId, audience: "user", permissions: ["projects:settings"] };
  const before = await service.invoke(person, get, {}) as VersionedProjectPluginMembership;
  const other = f.get(otherProjectId);
  const change = { plugin_id: "pages", enabled: true, expected_revision: before.revision };
  for (const audience of ["plugin", "agent"] as const) {
    assert.deepEqual(await service.invoke({ ...person, audience }, get, {}), before);
  }
  for (const audience of ["plugin", "agent", "workflow", "mcp"] as const) {
    await assert.rejects(service.invoke({ ...person, audience }, set, change), { code: "actions.forbidden" });
  }
  for (const extra of [{ actor_id: "forged" }, { project_id: otherProjectId }]) {
    await assert.rejects(service.invoke(person, get, extra), { code: "actions.input_invalid" });
    await assert.rejects(service.invoke(person, set, { ...change, ...extra }), { code: "actions.input_invalid" });
  }
  await assert.rejects(service.invoke(person, set, { plugin_id: "pages", enabled: true }), { code: "actions.input_invalid" });
  assert.deepEqual(f.events(), []);
  assert.deepEqual(f.get(), before);

  const saved = await service.invoke(person, set, change) as VersionedProjectPluginMembership;
  assert.deepEqual(saved.plugins, ["goals", "pages"]);
  assert.deepEqual(saved.hidden, []);
  assert.notEqual(saved.revision, before.revision);
  assert.deepEqual(await service.invoke(person, get, {}), saved);
  assert.deepEqual(f.get(otherProjectId), other);
  const events = [{ project_id: projectId, actor_id: actorId, type: "project.plugin_added", plugin_id: "pages" }];
  assert.deepEqual(f.events(), events);

  await assert.rejects(service.invoke(person, set, change), { code: "actions.conflict" });
  await assert.rejects(service.invoke(person, set, { ...change, enabled: false }), { code: "actions.conflict" });
  assert.deepEqual(await service.invoke(person, set, { ...change, expected_revision: saved.revision }), saved);
  assert.deepEqual(f.get(), saved);
  assert.deepEqual(f.portable.read(projectId)?.plugins, ["pages"]);
  assert.deepEqual(f.events(), events);
});

test("SPC-C08 set follows always-on, companion and personal hiding rules", t => {
  const f = fixture(t);
  const before = f.get();
  assert.throws(() => f.set("goals", false, before.revision), { code: "catalog.plugin_always_on" });
  assert.deepEqual(f.set("goals", true, before.revision), before);
  assert.deepEqual(f.projects.query.storedProjectPluginMembership(projectId), { plugins: [], hidden: [] });
  assert.deepEqual(f.portable.read(projectId)?.plugins, []);
  assert.deepEqual(f.events(), []);

  const withFeed = f.set("feed", true, before.revision);
  assert.deepEqual(withFeed.plugins, ["feed", "goals", "inbox"]);
  const withoutFeed = f.set("inbox", false, withFeed.revision);
  assert.deepEqual(withoutFeed.plugins, ["goals"]);
  assert.notEqual(withoutFeed.revision, before.revision);
  assert.throws(() => f.set("goals", true, before.revision), { code: "actions.conflict" });

  const hidden = f.set("personal", false, withoutFeed.revision);
  assert.deepEqual(hidden.hidden, ["personal"]);
  assert.deepEqual(hidden.plugins, withoutFeed.plugins);
  assert.deepEqual(f.set("personal", false, hidden.revision), hidden);
  const shown = f.set("personal", true, hidden.revision);
  assert.deepEqual(shown.hidden, []);
  assert.deepEqual(shown.plugins, withoutFeed.plugins);
  assert.notEqual(shown.revision, withoutFeed.revision);
  assert.throws(() => f.set("personal", false, withoutFeed.revision), { code: "actions.conflict" });
  assert.deepEqual(f.get(), shown);
  assert.deepEqual(f.events().map(event => [event.type, event.plugin_id]), [
    ["project.plugin_added", "feed"], ["project.plugin_added", "inbox"],
    ["project.plugin_removed", "inbox"], ["project.plugin_removed", "feed"],
    ["project.plugin_removed", "personal"], ["project.plugin_added", "personal"],
  ]);
});

test("SPC-C08 earlier clocks and decreasing event ids cannot hide a membership ABA after reopening", t => {
  const f = fixture(t);
  const before = f.set("pages", true, f.get().revision);
  const input = { project_id: projectId, plugin_id: "pages", actor_id: actorId };
  f.setTime("2026-11-07T01:00:00.000Z");
  f.projects.commands.removeProjectPlugin(input);
  f.setTime("2026-11-06T01:00:00.000Z");
  f.projects.commands.addProjectPlugin(input);
  const events = f.events();
  assert.equal(events.length, 3);
  f.db.close();

  const reopened = f.open();
  const after = reopened.get();
  assert.deepEqual(after.plugins, before.plugins);
  assert.deepEqual(after.hidden, before.hidden);
  assert.notEqual(after.revision, before.revision);
  assert.throws(() => reopened.set("pages", true, before.revision), { code: "actions.conflict" });
  assert.deepEqual(reopened.get(), after);
  assert.deepEqual(f.events(reopened.db), events);
});

test("SPC-C08 a second connection cannot commit a competing change from the same observation", t => {
  const f = fixture(t);
  const observed = f.get();
  let overlapped = false;
  const writer = f.open({
    ...registry,
    companions(pluginId) {
      overlapped = true;
      // At this point the first writer has checked the revision, but has inserted no members yet.
      assert.deepEqual(f.get(), observed);
      assert.throws(() => f.set("pages", true, observed.revision), error => sqliteErrorName(error) === "SQLITE_BUSY");
      return registry.companions(pluginId);
    },
  });
  const committed = writer.set("feed", true, observed.revision);
  assert.equal(overlapped, true);
  assert.deepEqual(committed.plugins, ["feed", "goals", "inbox"]);
  assert.throws(() => f.set("pages", true, observed.revision), { code: "actions.conflict" });
  assert.deepEqual(f.get(), committed);
  assert.deepEqual(f.events().map(event => event.plugin_id), ["feed", "inbox"]);
});

test("SPC-C08 missing facts are refused, and passive sync records only portable intent", t => {
  const f = fixture(t);
  const before = f.get();
  assert.throws(() => f.get("missing"), { code: "catalog.project_not_found" });
  assert.throws(() => f.projects.commands.setProjectPlugin("missing", actorId, {
    plugin_id: "pages", enabled: true, expected_revision: before.revision,
  }), { code: "catalog.project_not_found" });
  assert.throws(() => f.set("missing", true, before.revision), { code: "catalog.plugin_not_found" });
  assert.throws(() => f.set("missing", false, before.revision), { code: "catalog.plugin_not_found" });
  const portable = f.portable.read(projectId)!;
  f.projects.lifecycle.transaction(() => f.portable.apply(projectId, { ...portable, plugins: ["pages"] }));
  assert.deepEqual(f.portable.read(projectId)?.plugins, ["pages"]);
  assert.deepEqual(f.get(), before);
  assert.deepEqual(f.events(), []);
});
