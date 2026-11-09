import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

const zeroCounts = () => ({
  prepareContext: 0, inspectActions: 0, discover: 0, discoverScenes: 0, projectPluginReads: 0, sqliteOpens: 0,
});
type Counts = ReturnType<typeof zeroCounts>;
const counters = Object.keys(zeroCounts()) as Array<keyof Counts>;
const startedAt = Date.parse("2026-11-09T18:00:00Z");
const samples = 3;

async function callMeter(t: TestContext) {
  let counts: Counts | undefined;
  const count = (key: keyof Counts) => { if (counts) counts[key]++; };

  // Replace the built-in's constructor before its ESM facade (and thus the Host) first loads. Every open still uses native SQLite.
  const sqlite = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof import("node:sqlite").DatabaseSync };
  const nativeDatabase = sqlite.DatabaseSync;
  sqlite.DatabaseSync = new Proxy(nativeDatabase, {
    construct(target, args, newTarget) {
      count("sqliteOpens");
      return Reflect.construct(target, args, newTarget);
    },
  });
  t.after(() => { sqlite.DatabaseSync = nativeDatabase; });
  const { DatabaseSync } = await import("node:sqlite");
  assert.equal(DatabaseSync, sqlite.DatabaseSync, "the same constructor must reach the Host's ESM imports");

  const { LocalHost, MolisWorkLocalHost, MolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-local-host");
  const { ActionService } = await import("@molis-ai/molis-work-kernel");
  const prepare = MolisWorkLocalHost.prototype.inspectPreparedActionMetadata;
  t.mock.method(MolisWorkLocalHost.prototype, "inspectPreparedActionMetadata", function (this: InstanceType<typeof MolisWorkLocalHost>, ...args: Parameters<typeof prepare>) {
    count("prepareContext");
    return prepare.apply(this, args);
  });
  const inspect = LocalHost.prototype.inspectActions;
  t.mock.method(LocalHost.prototype, "inspectActions", function (this: typeof LocalHost.prototype, ...args: Parameters<typeof inspect>) {
    count("inspectActions");
    return inspect.apply(this, args);
  });
  const discover = ActionService.prototype.discover;
  t.mock.method(ActionService.prototype, "discover", function (this: InstanceType<typeof ActionService>, ...args: Parameters<typeof discover>) {
    count("discover");
    return discover.apply(this, args);
  });
  const scenes = ActionService.prototype.discoverScenes;
  t.mock.method(ActionService.prototype, "discoverScenes", function (this: InstanceType<typeof ActionService>, ...args: Parameters<typeof scenes>) {
    count("discoverScenes");
    return scenes.apply(this, args);
  });
  const membership = MolisWorkProjectCatalog.prototype.projectPluginMembership;
  t.mock.method(MolisWorkProjectCatalog.prototype, "projectPluginMembership", function (this: InstanceType<typeof MolisWorkProjectCatalog>, ...args: Parameters<typeof membership>) {
    count("projectPluginReads");
    return membership.apply(this, args);
  });
  const plugins = MolisWorkProjectCatalog.prototype.listProjectPlugins;
  t.mock.method(MolisWorkProjectCatalog.prototype, "listProjectPlugins", function (this: InstanceType<typeof MolisWorkProjectCatalog>, ...args: Parameters<typeof plugins>) {
    count("projectPluginReads");
    return plugins.apply(this, args);
  });
  return async (request: () => Promise<void>): Promise<Counts> => {
    const measured = zeroCounts();
    counts = measured;
    try { await request(); } finally { counts = undefined; }
    return measured;
  };
}

function median(runs: readonly Counts[]): Counts {
  const result = zeroCounts();
  for (const key of counters) result[key] = runs.map(run => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)]!;
  return result;
}

type Source = { id: string; kinds: Array<{ kind: string }> };
type FileList = { page: { entries: Array<{ subject: { kind: string; id: string }; title: string }> } };

// BCC-02 / BCC-04: use real Web routes in one disposable Home. HTTP samples include every awaited nested action.
test("BCC-02 and BCC-04 · representative Host requests stay within their measured call budgets", { timeout: 60_000 }, async t => {
  const measure = await callMeter(t);
  // Move Date past request caches without running intervals or deferred search and knowledge refreshes.
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: startedAt });
  const { openTestHome } = await import("./fixtures/test-home.js");
  const home = await openTestHome(t, { host: { clock: () => new Date() } });
  const project = await home.createProject("Call budget", ["pages"]);
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const goalIds = ["BUDGET-ONE", "BUDGET-TWO"];
  for (const goalId of goalIds) {
    await home.web.post(prefix + "/api/plugins/io.molis.work.goals/goals", { title: goalId, goal_id: goalId, idempotency_key: goalId });
  }
  const title = "Measured document", markdown = "Content for the file preview budget.";
  await home.web.post(prefix + "/api/plugins/io.molis.work.pages/pages", { title, markdown });

  const fileKind = "pages_document";
  const sourcesPath = prefix + "/api/side/files/sources";
  const { sources } = await home.web.get<{ sources: Source[] }>(sourcesPath);
  const source = sources.find(entry => entry.kinds.some(kind => kind.kind === fileKind));
  assert.ok(source, "Pages is a live side-file source in the sample project");
  const fileQuery = new URLSearchParams({ source: source.id });
  const entriesPath = prefix + "/api/side/files/entries?" + fileQuery;
  const { page } = await home.web.get<FileList>(entriesPath);
  const file = page.entries.find(entry => entry.title === title);
  assert.ok(file, "the seeded document is listed");
  const previewPath = prefix + "/api/side/files/content?";
  const previewQuery = new URLSearchParams({ source: source.id, kind: fileKind, id: file.subject.id });
  const rawPath = prefix + "/api/side/files/raw?";
  const missingKind = new URLSearchParams({ source: source.id, id: file.subject.id });
  const missingId = new URLSearchParams({ source: source.id, kind: fileKind });

  async function refusal(path: string, status: number, message: RegExp) {
    const response = await fetch(home.origin + path);
    assert.equal(response.status, status, path);
    assert.match(await response.text(), message, path);
  }

  const requests = {
    projectHome: async () => {
      const response = await fetch(home.origin + prefix + "/", { redirect: "error" });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /data-side-panel/u);
      assert.ok(html.includes(project.display_name));
    },
    projectBrief: async () => {
      const brief = await home.web.get<{ html: string; summary: object }>(`/api/projects/${project.project_id}/brief`);
      assert.match(brief.html, /BUDGET-(ONE|TWO)/u);
      assert.ok(brief.summary);
    },
    rightSide: async () => {
      const result = await home.web.get<{ states: Array<{ id: string; kind: string }>; model_ready: boolean }>(prefix + "/api/knowledge/states");
      assert.ok(result.states.some(state => state.id === file.subject.id && state.kind === fileKind));
      assert.equal(typeof result.model_ready, "boolean");
    },
    contextual: async () => {
      const { surfaces } = await home.web.get<{ surfaces: Record<string, { kind: string }> }>(prefix + "/api/contextual/surfaces");
      assert.ok(Object.values(surfaces).some(surface => surface.kind === fileKind), "the contextual directory still reaches Pages");
    },
    sideFileSources: async () => {
      const result = await home.web.get<{ sources: Source[] }>(sourcesPath);
      assert.ok(result.sources.some(entry => entry.id === source.id));
    },
    sideFileEntries: async () => {
      const result = await home.web.get<FileList>(entriesPath);
      assert.ok(result.page.entries.some(entry => entry.subject.id === file.subject.id));
    },
    sideFilePreview: async () => {
      const { content } = await home.web.get<{ content: { data: string } }>(previewPath + previewQuery);
      assert.ok(content.data.includes(markdown));
    },
    sideFileMissingSource: () => refusal(prefix + "/api/side/files/entries", 404, /文件来源已经不在/u),
    sideFileMissingKind: () => refusal(previewPath + missingKind, 400, /没有说明要预览哪个文件/u),
    sideFileMissingId: () => refusal(rawPath + missingId, 400, /没有说明要预览哪个文件/u),
    goalPanes: async () => {
      await Promise.all(goalIds.map(async goalId => {
        const response = await fetch(`${home.origin}${prefix}/api/goals/${goalId}/document?view=current`);
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes(goalId));
      }));
    },
  };

  const measured: Record<string, Counts> = {};
  let now = startedAt;
  for (const [name, request] of Object.entries(requests)) {
    const runs: Counts[] = [];
    for (let sample = 0; sample < samples; sample++) {
      t.mock.timers.setTime(now += 60_000);
      runs.push(await measure(request));
    }
    measured[name] = median(runs);
  }

  if (process.env.MOLIS_WORK_CALL_BUDGET_REPORT === "1" && !process.env.CI) {
    t.diagnostic(JSON.stringify(measured));
    return;
  }
  const budget = JSON.parse(readFileSync(new URL("../tooling/gates/call-budget.json", import.meta.url), "utf8")) as Record<string, Counts>;
  assert.deepEqual(Object.keys(budget).sort(), Object.keys(measured).sort());
  for (const [name, observed] of Object.entries(measured)) {
    assert.deepEqual(Object.keys(budget[name]!).sort(), [...counters].sort(), name);
    for (const key of counters) {
      assert.ok(observed[key] <= budget[name]![key], `${name} ${key}: ${observed[key]} > ${budget[name]![key]}`);
    }
  }
});
