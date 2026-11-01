import { fakeGoalDirectory, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { StagePageModel, UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";

import {
  DEMO_PROJECT_ID,
  ensureProjectPlugins,
  LocalProjectDatabase,
  openProjectVersionStores,
  releaseProjectPlugins,
  renderProjectRuntimeStages,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { CODING_COMPANION_DIRECTORY_SLOT, CODING_COMPANION_RESULT_SLOT, codingManifest } from "@molis-ai/molis-work-plugin-coding";

// PG-036 C9: Coding's page and the stages of the plugins it embeds (Files, Git, Diff, Text Stats) are drawn by the plugins' own
// contributions through the Host's generic stage channel; the Host has no file of its own that knows Coding (coding-surface.ts is gone).

type State = Awaited<ReturnType<typeof ensureProjectPlugins>>;
const repoRoot = process.cwd();
const SHOWN = ["coding", "files", "git", "diff", "text-stats"];
const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The page's primitives with `text` answering the key itself, so the markup says which stable key each place uses. */
const model = (shown: readonly string[] = SHOWN) => () => ({ route_prefix: "/p", shown_plugins: shown, primitives: { escape, text: (key: string) => key } });

/** One project with its plugins running, and the stages the Host draws for them. */
async function withProject<T>(run: (store: LocalProjectDatabase, state: State) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), "coding-companions-"));
  try {
    const file = join(directory, "board.db");
    seedDemoBoard(file);
    const store = new LocalProjectDatabase(file);
    try {
      const state = await ensureProjectPlugins({ store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID,
        actions: fakeGoalDirectory(pluginActions(store, DEMO_PROJECT_ID), () => ({})), actorId: "web-user", translate: (value: string) => value });
      return await run(store, state);
    } finally {
      await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** `target` with the members `override` names replaced; methods stay bound to `target`, whose private state they read. */
function overriding<T extends object>(target: T, override: Record<string, unknown>): T {
  return new Proxy(target, { get: (object, key) => {
    if (typeof key === "string" && key in override) return override[key];
    const value = Reflect.get(object, key, object);
    return typeof value === "function" ? value.bind(object) : value;
  } });
}

/** The state with `contribution(pluginId)` answered by `change`, which gets the real answer; everything else is the real one. */
function withContribution(state: State, change: (pluginId: string, real: unknown) => unknown): State {
  const real = state.platform!.supervisor;
  const supervisor = overriding(real, { contribution: (pluginId: string) => change(pluginId, real.contribution(pluginId)) });
  return overriding(state, { platform: overriding(state.platform!, { supervisor }) });
}

const stageOf = (html: readonly string[], surface: string) => html.find(item => item.includes(`data-work-surface="${surface}"`)) ?? "";

test("RAC-433 Coding's stage is its running instance's page through the generic channel, with the embedded plugins' directories and readers in the slots in Manifest order", async () => {
  await withProject(async (store, state) => {
    const { html, surfaces, unavailable } = renderProjectRuntimeStages(state, store, { shown: SHOWN, drawn: [], model: model() });
    assert.deepEqual(unavailable, []);
    assert.equal(new Set(surfaces.map(item => item.contribution_id)).size, 5, "one stage for each of the five plugins");
    const coding = stageOf(html, "coding");
    assert.match(coding, /data-coding-workbench/);
    assert.match(coding, /data-coding-directory/);
    // Manifest order: embedded_plugins lists Files before Git; both fill the directory and the result slot of the page.
    assert.deepEqual(codingManifest.ui.embedded_plugins, ["io.molis.work.files", "io.molis.work.git", "io.molis.work.diff", "io.molis.work.text-stats"]);
    const at = (text: string) => coding.indexOf(text);
    for (const marker of ["data-files-browser", "data-git-browser", "data-files-results", "data-git-results"]) assert.ok(at(marker) > 0, `${marker} is in Coding's page`);
    assert.ok(at("data-files-browser") < at("data-git-browser"), "directories: Files before Git");
    assert.ok(at("data-files-results") < at("data-git-results"), "readers: Files before Git");
    assert.ok(at("data-coding-directory") < at("data-files-browser") && at("data-git-browser") < at("data-coding-results-index"), "the directories are in the page's directory, the readers after the results index");
    // Diff and Text Stats declare no surface for the two slots: they add nothing to Coding's page.
    assert.doesNotMatch(coding, /data-companion=/);
  });
});

test("RAC-434 each companion's own stage keeps the markup the Coding client fills, built from stable keys of the plugin's own words", async () => {
  await withProject(async (store, state) => {
    const { html } = renderProjectRuntimeStages(state, store, { shown: SHOWN, drawn: [], model: model() });
    for (const surface of ["files", "git", "diff", "text-stats"]) {
      const stage = stageOf(html, surface);
      assert.match(stage, new RegExp(`data-coding-companion="workbench"[^>]*data-companion="${surface}"`), `${surface} keeps its companion hooks`);
      assert.match(stage, /hidden/, `${surface} starts hidden until the client shows it`);
      assert.match(stage, new RegExp(`${surface}\\.stage\\.`), `${surface} words its stage with its own keys`);
    }
    const files = stageOf(html, "files");
    assert.match(files, /href="\/p\/settings\/workspaces"/);
    assert.match(files, /companion-directory/); assert.match(files, /data-files-browser/); assert.match(files, /data-files-results/);
    const git = stageOf(html, "git");
    assert.match(git, /data-git-browser/); assert.match(git, /data-git-results/);
    // A list companion reaches the files through Files when Files is shown, and through the market otherwise.
    assert.match(stageOf(html, "diff"), /data-companion-open="files"/);
    assert.match(stageOf(html, "text-stats"), /data-companion-open="files"/);
    const without = renderProjectRuntimeStages(state, store, { shown: ["coding", "diff", "text-stats"], drawn: [], model: model(["coding", "diff", "text-stats"]) }).html;
    assert.match(stageOf(without, "diff"), /data-companion-open="market"/);
    assert.match(stageOf(without, "text-stats"), /data-companion-open="market"/);
    assert.equal(stageOf(without, "files"), "", "a plugin the project does not show draws no stage");
  });
});

test("RAC-435 an embedded plugin that is not running leaves its place in Coding's page empty; the page and the other embedded plugins still draw", async () => {
  await withProject(async (store, state) => {
    const stopped = withContribution(state, (pluginId, real) => pluginId === "io.molis.work.git" ? undefined : real);
    const { html } = renderProjectRuntimeStages(stopped, store, { shown: SHOWN, drawn: [], model: model() });
    const coding = stageOf(html, "coding");
    assert.match(coding, /data-coding-workbench/);
    assert.match(coding, /data-files-browser/, "Files still fills its place");
    assert.doesNotMatch(coding, /data-git-browser|data-git-results/, "Git's places are empty");
  });
});

test("RAC-436 an embedded surface that fails leaves its place empty and the page draws", async () => {
  await withProject(async (store, state) => {
    const failing = withContribution(state, (pluginId, real) => {
      const contribution = real as { kind?: string; views?: Array<{ descriptor: unknown }> } | undefined;
      if (pluginId !== "io.molis.work.files" || contribution?.kind !== "app") return real;
      return { ...contribution, views: (contribution.views ?? []).map(view => ({ descriptor: view.descriptor, render: () => { throw new Error("the surface failed"); } })) };
    });
    const { html, unavailable } = renderProjectRuntimeStages(failing, store, { shown: SHOWN, drawn: [], model: model() });
    const coding = stageOf(html, "coding");
    assert.match(coding, /data-coding-workbench/);
    assert.doesNotMatch(coding, /data-files-browser|data-files-results/, "Files' places are empty");
    assert.match(coding, /data-git-browser/, "Git still fills its place");
    assert.ok(unavailable.some(stage => stage.surface === "files"), "Files' own stage, which fails the same way, is the unavailable shell");
    assert.ok(!unavailable.some(stage => stage.surface === "coding"));
  });
});

test("RAC-437 a companion whose page is not there gets the unavailable shell with the reason, not a stage the Host made up", async () => {
  await withProject(async (store, state) => {
    const missing = withContribution(state, (pluginId, real) => pluginId === "io.molis.work.diff" ? undefined : real);
    const { html, unavailable, surfaces } = renderProjectRuntimeStages(missing, store, { shown: SHOWN, drawn: [], model: model() });
    assert.equal(stageOf(html, "diff"), "");
    assert.deepEqual(unavailable.map(stage => stage.surface), ["diff"]);
    assert.ok(unavailable[0]!.reason.length > 0);
    assert.ok(!surfaces.some(item => item.contribution_id === "io.molis.work.native.diff.ui.v1"), "a missing view has no rendered pair; the unavailable stage prevents catalog recovery");
    assert.match(stageOf(html, "coding"), /data-coding-workbench/);
  });
});

test("RAC-438 the Host has no file of its own for Coding: coding-surface.ts is gone, Coding is no hybrid, and only the supervisor starts the companions", () => {
  assert.equal(existsSync(join(repoRoot, "apps/local-host/src/coding-surface.ts")), false);
  const gate = readFileSync(join(repoRoot, "tests/builtin-plugin-assembly-gate.test.ts"), "utf8");
  // The current assembly gate freezes Goals as its only remaining hybrid; Coding has left that list.
  assert.match(gate, /HYBRID_RUNTIME_PLUGINS: ReadonlySet<string> = new Set<string>\(\["goals"\]\);/);
  const dir = join(repoRoot, "apps/local-host/src");
  const importers = (pluginName: string) => readdirSync(dir).filter(file => file.endsWith(".ts"))
    .filter(file => new RegExp(`from "@molis-ai/molis-work-plugin-${pluginName}(/registration)?"`).test(readFileSync(join(dir, file), "utf8")));
  // Since PG-067 the supervisor starts a companion from its registration's `project_runtime`, and the Host reaches that registration
  // only through the generated registry (#1299 PR-B4): no other Host file names a companion's package, Files included since its
  // factory takes nothing from the Host (BL-616, RAC-2530).
  const registry = "plugin-registry.generated.ts";
  assert.deepEqual(importers("git"), [registry]);
  assert.deepEqual(importers("diff"), [registry]);
  assert.deepEqual(importers("text-stats"), [registry]);
  assert.deepEqual(importers("files"), [registry]);
  assert.match(readFileSync(join(dir, "project-plugins.ts"), "utf8"), /projectRuntimeDeclarations\(\)[^;]*create\(\)/s, "the supervisor starts the companions from their registrations' project_runtime");
  // The one stage module draws any plugin's page from its declarations: it names no plugin. The Plugin Runtime and the plugin
  // SDK are the platform, not plugins, so their package names are not a plugin's name (#1274 reads the supervisor's state type).
  assert.doesNotMatch(readFileSync(join(dir, "project-plugin-stages.ts"), "utf8"), /molis-work-plugin-(?!runtime"|sdk["/])|["'`](coding|files|git|diff|text-stats)["'`]/);
});

test("RAC-439 BL-521 the Host has no route hook that reads Files for a consumer of its outputs: a change of the workspace settings reaches Files as an event", () => {
  const dir = join(repoRoot, "apps/local-host/src");
  assert.equal(existsSync(join(dir, "project-plugin-input-refresh.ts")), false, "the file that held the hook is gone");
  const left = readdirSync(dir).filter(file => file.endsWith(".ts")
    && /codingRouteHooks|filesOutputsRefresh|readsFilesOutputs|ProjectPluginRouteHooks/.test(readFileSync(join(dir, file), "utf8")));
  assert.deepEqual(left, [], "no file of the Host names the hook or reads Files' outputs on its own");
  // The route entry takes no hook before a route; it only lets the input graph settle after the plugin answered.
  const entry = readFileSync(join(dir, "project-plugin-http.ts"), "utf8");
  assert.doesNotMatch(entry, /hooks|beforeDispatch/);
  assert.doesNotMatch(readFileSync(join(dir, "plugin-route-operations.ts"), "utf8"), /beforeDispatch/);
});

test("RAC-449 every surface an embedded plugin puts into Coding's page targets a slot Coding declares and in a format the slot accepts", async () => {
  await withProject(async (_store, state) => {
    const supervisor = state.platform!.supervisor;
    const coding = supervisor.contribution("io.molis.work.coding");
    if (coding?.kind !== "app") throw new Error("Coding is not running as an app");
    const slots = new Map((coding.views ?? []).flatMap(view => view.descriptor.slots).map(slot => [slot.slot_id, slot.accepts as readonly string[]] as const));
    assert.deepEqual([...slots.keys()].sort(), [CODING_COMPANION_DIRECTORY_SLOT, CODING_COMPANION_RESULT_SLOT].sort());
    const targets: string[] = [];
    for (const embeddedId of codingManifest.ui.embedded_plugins ?? []) {
      const embedded = supervisor.contribution(embeddedId);
      if (embedded?.kind !== "app") continue;
      for (const surface of (embedded.views ?? []).flatMap(view => view.descriptor.surfaces ?? [])) {
        if (!surface.target_slot_id?.startsWith("coding.")) continue;
        assert.ok(slots.has(surface.target_slot_id), `${embeddedId} ${surface.surface_id} targets ${surface.target_slot_id}, which Coding does not declare`);
        assert.ok(slots.get(surface.target_slot_id)!.includes(surface.format), `${embeddedId} ${surface.surface_id} is ${surface.format}, which the slot does not accept`);
        targets.push(`${embeddedId}:${surface.surface_id}`);
      }
    }
    assert.deepEqual(targets.sort(), ["io.molis.work.files:browser-directory", "io.molis.work.files:browser-result", "io.molis.work.git:browser-directory", "io.molis.work.git:browser-result"]);
  });
});

// RAC-2682: the actual route owner alone may publish; its nested owners cannot inherit the port.
test("RAC-2682 only the actual page owner publishes and a failed main render adopts nothing", async () => {
  await withProject(async (store, state) => {
    for (const fail of [false, true]) {
      const seen: Array<{ pluginId: string; surface: string; page: boolean }> = [];
      const wrapped = withContribution(state, (pluginId, real) => {
        const contribution = real as { kind?: string; views?: UiContribution<StagePageModel>[] } | undefined;
        if (contribution?.kind !== "app") return real;
        return { ...contribution, views: contribution.views?.map(view => ({ ...view, render: (request: Parameters<typeof view.render>[0]) => {
          seen.push({ pluginId, surface: request.surface, page: Boolean(request.model.page) });
          if (pluginId === codingManifest.plugin_id && request.surface === "workbench") {
            request.model.page?.publish({ title: "Actual owner" });
            if (fail) throw new Error("main render failed after publication");
          }
          return view.render(request);
        } })) };
      });
      const result = renderProjectRuntimeStages(wrapped, store, { shown: SHOWN, drawn: [], page_owner: codingManifest.plugin_id,
        model: () => ({ ...model()(), page: { publish() { assert.fail("caller-supplied publisher escaped"); } } }) });
      assert.ok(seen.some(entry => entry.pluginId !== codingManifest.plugin_id && entry.surface !== "workbench"), "real nested surfaces were drawn");
      assert.ok(seen.filter(entry => entry.pluginId !== codingManifest.plugin_id).every(entry => !entry.page), "neither foreign embedded nor foreign main surfaces receive the publisher");
      if (fail) {
        assert.equal(result.page, undefined);
        assert.ok(result.unavailable.some(entry => entry.surface === "coding"));
      } else {
        assert.equal(result.page?.parts.title, "Actual owner");
        assert.match(result.page!.html, /data-coding-workbench/);
        assert.doesNotMatch(result.html.join(""), /data-coding-workbench/, "the page anchor is its only copy");
      }
    }
  });
});
