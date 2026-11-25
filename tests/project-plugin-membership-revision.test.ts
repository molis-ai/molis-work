import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  PROJECT_WORKSPACE_PROVIDER_ID,
  partitionPluginActions,
  projectPluginActions,
  type VersionedPartitionPluginMembership,
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
  return { ...first, open, events, portable, directory, setTime: (time: string) => { now = time; } };
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
  assert.deepEqual(saved.plugins, ["pages"]);
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

test("SPC-C08 set follows companion and personal hiding rules", t => {
  const f = fixture(t);
  const before = f.get();
  assert.deepEqual(before.plugins, [], "a new project has no member nobody chose (44B: nothing is 常开)");
  assert.deepEqual(f.projects.query.storedProjectPluginMembership(projectId), { plugins: [], hidden: [] });
  assert.deepEqual(f.portable.read(projectId)?.plugins, []);
  assert.deepEqual(f.events(), []);

  const withFeed = f.set("feed", true, before.revision);
  assert.deepEqual(withFeed.plugins, ["feed", "inbox"]);
  const withoutFeed = f.set("inbox", false, withFeed.revision);
  assert.deepEqual(withoutFeed.plugins, []);
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
  assert.deepEqual(committed.plugins, ["feed", "inbox"]);
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

/** The SQL each `prepare` on this connection was handed, so a test can count the owner's reads. */
function countingStatements(db: SqliteDatabase) {
  const statements: string[] = [];
  const counted = new Proxy(db, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => { statements.push(sql); return target.prepare(sql); };
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { counted, statements };
}

test("BL-project-membership-revision-read one versioned read is one statement, with no extra event lookup", t => {
  const f = fixture(t);
  f.set("pages", true, f.get().revision);
  const { counted, statements } = countingStatements(f.db);
  const projects = new ProjectsModule({ db: counted, plugins: registry, projects_directory: f.directory, outputs_directory: join(f.directory, "outputs") });
  const read = (operation: () => unknown) => {
    statements.length = 0;
    operation();
    return [...statements];
  };
  const unversioned = read(() => projects.query.projectPluginMembership(projectId));
  const versioned = read(() => projects.query.projectPluginMembershipWithRevision(projectId));
  // Before: the project looked up twice, members, hidden marks, then a separate latest-event query (5); the unversioned read is 4.
  assert.equal(versioned.length, 1, versioned.join("\n---\n"));
  assert.ok(versioned.length < unversioned.length);
  assert.match(versioned[0]!, /project_events/u);
  assert.deepEqual(projects.query.projectPluginMembershipWithRevision(projectId), f.get());
});

test("BL-project-membership-revision-read lists and hidden rules match the unversioned read, and the revision keeps its formula", t => {
  const f = fixture(t);
  const { get, set, projects } = f.open(registry);
  const latestEvent = (project: string) => (f.db.prepare<[string], { event_id: string }>(`
    SELECT event_id FROM project_events WHERE project_id = ? AND type IN ('project.plugin_added', 'project.plugin_removed')
    ORDER BY rowid DESC LIMIT 1
  `).get(project))?.event_id ?? null;
  const check = (project: string, label: string) => {
    const versioned = get(project);
    const { plugins, hidden } = versioned;
    assert.deepEqual({ plugins, hidden }, projects.query.projectPluginMembership(project), label);
    const facts = [project, [...plugins].sort(), [...hidden].sort(), latestEvent(project)];
    assert.equal(versioned.revision, createHash("sha256").update(JSON.stringify(facts)).digest("hex"), label);
  };
  check(projectId, "fresh project");
  check(otherProjectId, "untouched second project");
  const withFeed = set("feed", true, get().revision);
  set("personal", false, withFeed.revision);
  check(projectId, "stored members with a companion and a hidden personal plugin");
  // Rows a sync can leave: a stored member that is also marked hidden, and ids whose byte order differs from a case-insensitive one.
  const at = "2026-11-08T02:00:00.000Z";
  f.db.prepare("INSERT INTO partition_plugins (partition_id, plugin_id, enabled_at, enabled_by) VALUES (?, 'goals', ?, ?), (?, 'Zeta', ?, ?)").run(projectId, at, actorId, projectId, at, actorId);
  f.db.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, 'goals', ?), (?, 'Alpha', ?)").run(projectId, at, projectId, at);
  check(projectId, "a stored member that is also marked hidden");
  assert.deepEqual(get().plugins, ["Zeta", "feed", "goals", "inbox"]);
  assert.deepEqual(get().hidden, ["Alpha", "goals", "personal"]);

  const recycle = f.projects.recycle;
  recycle.change({
    project_id: otherProjectId, actor_id: actorId, operation_id: "recycle-1",
    expected_state: recycle.inspect(otherProjectId).state, recycled: true, confirmed: true,
  }, () => {});
  assert.throws(() => projects.query.projectPluginMembership(otherProjectId), { code: "catalog.project_not_found" });
  assert.throws(() => get(otherProjectId), { code: "catalog.project_not_found" });
  assert.throws(() => get(" "), { code: "catalog.project_not_found" });
});

test("BL-project-membership-revision-read adding a plugin and removing it again leaves the first observation stale", t => {
  const f = fixture(t);
  const before = f.get();
  const added = f.set("pages", true, before.revision);
  const back = f.set("pages", false, added.revision);
  assert.deepEqual({ plugins: back.plugins, hidden: back.hidden }, { plugins: before.plugins, hidden: before.hidden });
  assert.notEqual(back.revision, before.revision);
  const events = f.events();
  for (const enabled of [true, false]) {
    assert.throws(() => f.set("pages", enabled, before.revision), { code: "actions.conflict" });
  }
  assert.deepEqual(f.events(), events);
  assert.deepEqual(f.get(), back);
});

test("UPP-21 partitions.plugins.set@1 changes several members of one partition at once, the personal space too, against one revision", async t => {
  const f = fixture(t);
  f.projects.lifecycle.register(f.projects.lifecycle.prepareRecord({ project_id: "personal", display_name: "个人空间", data_class: "user", reserved_partition: true }),
    "project.created", actorId);
  const { get, set } = partitionPluginActions;
  const service = new ActionService();
  const dispose = service.registerProvider({
    provider: { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "分区插件成员", kind: "system" },
    definitions: [get, set],
    handlers: [
      bindActionHandler(get, (_, caller) => f.projects.query.partitionPluginMembership(caller.project_id!)),
      bindActionHandler(set, async (input, caller) => {
        await caller.beforeEffect();
        return f.projects.commands.setPartitionPlugins(caller.project_id!, caller.actor_id, input);
      }),
    ],
  });
  t.after(dispose);
  const person: ActionCallContext = { project_id: "personal", actor_id: actorId, audience: "user", permissions: ["projects:settings"] };
  const before = await service.invoke(person, get, {}) as VersionedPartitionPluginMembership;
  assert.equal(before.partition_id, "personal");
  const project = f.get();
  for (const audience of ["plugin", "agent", "workflow", "mcp"] as const) {
    await assert.rejects(service.invoke({ ...person, audience }, set, { changes: [{ plugin_id: "pages", enabled: true }], expected_revision: before.revision }), { code: "actions.forbidden" });
  }
  for (const changes of [[], [{ plugin_id: "pages", enabled: true }, { plugin_id: "pages", enabled: false }],
    Array.from({ length: 33 }, (_, index) => ({ plugin_id: `plugin-${index}`, enabled: true }))]) {
    await assert.rejects(service.invoke(person, set, { changes, expected_revision: before.revision }), { code: "actions.input_invalid" }, "empty, repeated or over-long lists are refused");
  }
  assert.deepEqual(f.events(), [], "no refused call wrote anything");

  const saved = await service.invoke(person, set, { changes: [{ plugin_id: "pages", enabled: true }, { plugin_id: "goals", enabled: true }], expected_revision: before.revision }) as VersionedPartitionPluginMembership;
  assert.deepEqual([...saved.plugins].sort(), ["goals", "pages"]);
  assert.equal(saved.partition_id, "personal");
  assert.deepEqual(await service.invoke(person, get, {}), saved);
  assert.deepEqual(f.get(), project, "another partition is untouched");
  const stored = f.db.prepare("SELECT plugin_id, enabled_by FROM partition_plugins WHERE partition_id = 'personal' ORDER BY plugin_id").all();
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), [{ plugin_id: "goals", enabled_by: actorId }, { plugin_id: "pages", enabled_by: actorId }], "who enabled each is recorded");

  await assert.rejects(service.invoke(person, set, { changes: [{ plugin_id: "pages", enabled: false }], expected_revision: before.revision }), { code: "actions.conflict" },
    "a stale revision changes nothing");
  await assert.rejects(service.invoke(person, set, { changes: [{ plugin_id: "goals", enabled: false }, { plugin_id: "unknown", enabled: true }], expected_revision: saved.revision }),
    { code: "catalog.plugin_not_found" });
  assert.deepEqual(await service.invoke(person, get, {}), saved, "one bad change leaves the whole batch unapplied");
  const after = await service.invoke(person, set, { changes: [{ plugin_id: "goals", enabled: false }, { plugin_id: "feed", enabled: true }], expected_revision: saved.revision }) as VersionedPartitionPluginMembership;
  assert.deepEqual([...after.plugins].sort(), ["feed", "inbox", "pages"], "a companion comes with its plugin");
});
