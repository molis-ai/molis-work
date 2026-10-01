import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  descriptionFromSummary,
  forgetProjectArrival,
  markProjectOpened,
  PROJECT_ARRIVAL_RELATIVE_PATH,
  readProjectArrival,
  setProjectDescription,
} from "../apps/local-host/src/project-arrival.js";

// What the chooser remembers about each project on this machine (specs/project-arrival-flow): presentation memory only,
// so every failure to read or write it must leave the chooser working with an empty memory.

function withHome(run: (home: string) => void) {
  const home = mkdtempSync(join(tmpdir(), "molis-arrival-store-"));
  try { run(home); } finally { rmSync(home, { recursive: true, force: true }); }
}
const at = (iso: string) => new Date(iso);

test("a Home that has never opened a project remembers nothing", () => {
  withHome(home => {
    assert.deepEqual(readProjectArrival(home), { schema_version: 1, last_project_id: null, projects: {} });
  });
});

test("opening a project stamps it and makes it the one to preselect", () => {
  withHome(home => {
    markProjectOpened(home, "a", at("2026-10-01T08:00:00Z"));
    markProjectOpened(home, "b", at("2026-10-01T09:00:00Z"));
    const state = readProjectArrival(home);
    assert.equal(state.last_project_id, "b");
    assert.deepEqual(state.projects.a, { last_opened_at: "2026-10-01T08:00:00.000Z", description: null });
    assert.deepEqual(state.projects.b, { last_opened_at: "2026-10-01T09:00:00.000Z", description: null });
    markProjectOpened(home, "a", at("2026-10-01T10:00:00Z"));
    assert.equal(readProjectArrival(home).last_project_id, "a");
  });
});

test("a reload of the project page is not a new visit", () => {
  withHome(home => {
    markProjectOpened(home, "a", at("2026-10-01T08:00:00Z"));
    markProjectOpened(home, "a", at("2026-10-01T08:00:03Z"));
    assert.equal(readProjectArrival(home).projects.a?.last_opened_at, "2026-10-01T08:00:00.000Z", "inside the window the first stamp stands");
    markProjectOpened(home, "a", at("2026-10-01T08:00:06Z"));
    assert.equal(readProjectArrival(home).projects.a?.last_opened_at, "2026-10-01T08:00:06.000Z");
    // Another project in between ends the window: going back is a visit.
    markProjectOpened(home, "b", at("2026-10-01T08:00:07Z"));
    markProjectOpened(home, "a", at("2026-10-01T08:00:08Z"));
    assert.equal(readProjectArrival(home).last_project_id, "a");
  });
});

test("the introduction a person accepted survives later visits and is cut to one chooser line", () => {
  withHome(home => {
    setProjectDescription(home, "a", "  把发布流程梳理清楚。  ");
    markProjectOpened(home, "a", at("2026-10-01T08:00:00Z"));
    assert.deepEqual(readProjectArrival(home).projects.a, { last_opened_at: "2026-10-01T08:00:00.000Z", description: "把发布流程梳理清楚。" });
    setProjectDescription(home, "a", "长".repeat(400));
    assert.equal(readProjectArrival(home).projects.a?.description?.length, 240);
    assert.equal(readProjectArrival(home).projects.a?.last_opened_at, "2026-10-01T08:00:00.000Z", "setting a description keeps the visit");
    setProjectDescription(home, "a", "   ");
    assert.equal(readProjectArrival(home).projects.a?.description, null);
  });
});

test("a summary becomes one sentence: its first paragraph, without headings or emphasis, kept to the length a row can carry", () => {
  assert.equal(descriptionFromSummary("## 项目概览\n\n**核心**：整理发布清单，\n并核对版本。\n\n第二段不要。"), "核心：整理发布清单， 并核对版本。", "a heading is a title, not the description");
  assert.equal(descriptionFromSummary("# 背景\n本项目要把发布流程梳理清楚。"), "本项目要把发布流程梳理清楚。");
  assert.equal(descriptionFromSummary("# 只有标题\n\n## 另一个标题"), null);
  assert.equal(descriptionFromSummary("把 **发布** 流程\n梳理清楚。\n\n另一段"), "把 发布 流程 梳理清楚。");
  assert.equal(descriptionFromSummary("   \n\n  "), null);
  assert.equal(descriptionFromSummary(""), null);
  const long = descriptionFromSummary("字".repeat(500))!;
  assert.equal(long.length, 240);
  assert.ok(long.endsWith("…"));
});

test("a project that no longer exists leaves no memory behind, not even the preselection", () => {
  withHome(home => {
    markProjectOpened(home, "a", at("2026-10-01T08:00:00Z"));
    markProjectOpened(home, "b", at("2026-10-01T09:00:00Z"));
    forgetProjectArrival(home, "b");
    const state = readProjectArrival(home);
    assert.equal(state.last_project_id, null);
    assert.deepEqual(Object.keys(state.projects), ["a"]);
    forgetProjectArrival(home, "never-there");
    assert.deepEqual(Object.keys(readProjectArrival(home).projects), ["a"]);
  });
});

test("a damaged or foreign file reads as an empty memory and is mended by the next visit", () => {
  withHome(home => {
    const file = join(home, PROJECT_ARRIVAL_RELATIVE_PATH);
    mkdirSync(join(home, "config"), { recursive: true });
    writeFileSync(file, "{ not json");
    assert.deepEqual(readProjectArrival(home).projects, {});
    writeFileSync(file, JSON.stringify({ schema_version: 9, last_project_id: 7, projects: { ok: { last_opened_at: "2026-10-01T08:00:00Z", description: " 一句 " }, bad: { last_opened_at: "yesterday", description: 3 }, worse: "x" } }));
    const state = readProjectArrival(home);
    assert.equal(state.last_project_id, null);
    assert.deepEqual(state.projects.ok, { last_opened_at: "2026-10-01T08:00:00.000Z", description: "一句" });
    assert.deepEqual(state.projects.bad, { last_opened_at: null, description: null });
    assert.equal("worse" in state.projects, false);
    markProjectOpened(home, "c", at("2026-10-01T09:00:00Z"));
    assert.equal(JSON.parse(readFileSync(file, "utf8")).last_project_id, "c");
  });
});

test("the file is written whole and private, and no staging file is left beside it", () => {
  withHome(home => {
    markProjectOpened(home, "a", at("2026-10-01T08:00:00Z"));
    const file = join(home, PROJECT_ARRIVAL_RELATIVE_PATH);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(join(home, "config")), ["project-arrival.json"]);
  });
});

test("a Home that cannot be written to never stops a project from opening", () => {
  withHome(home => {
    // A file where the config directory should be: every write fails, and every call still returns.
    writeFileSync(join(home, "config"), "in the way");
    assert.doesNotThrow(() => markProjectOpened(home, "a"));
    assert.doesNotThrow(() => setProjectDescription(home, "a", "x"));
    assert.doesNotThrow(() => forgetProjectArrival(home, "a"));
    assert.deepEqual(readProjectArrival(home).projects, {});
  });
});
