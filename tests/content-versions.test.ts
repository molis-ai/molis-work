import assert from "node:assert/strict";
import test from "node:test";
import { contentVersionChanges } from "../scripts/gates/content-versions.mjs";

// The content-version gate covers the methods of built-in plugins and the Skills of content packs, in every language.
const key = "method.planning-methods.work-design-plan";
const file = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.md";
const english = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.en.md";
const body = "---\nname: work-design-plan\nversion: 1\n---\n\n# 设计与规划\n";
const englishBody = "# Design and planning\n";
const table = (version: number) => JSON.stringify({ versions: { [key]: version } });
const run = (currentBody: string, currentEnglish: string, version: number, files = [file]) => {
  const before = new Map([["tooling/versions.json", table(1)], [file, body], [english, englishBody]]);
  const after = new Map([["tooling/versions.json", table(version)], [file, currentBody], [english, currentEnglish]]);
  return contentVersionChanges({ files, read: path => after.get(path) }, path => before.get(path));
};

test("content versions: a content pack Skill body that changes must advance its version, in either language", () => {
  assert.deepEqual(run(body, englishBody, 1), [], "unchanged body at the same version passes");
  assert.match(run(body.replace("设计与规划", "设计和规划"), englishBody, 1)[0] ?? "", /changed content without advancing its version/u);
  assert.deepEqual(run(body.replace("设计与规划", "设计和规划"), englishBody, 2), [], "a changed default body at the next version passes");
  assert.match(run(body, englishBody.replace("Design", "Designing"), 1, [english])[0] ?? "", /changed content without advancing its version/u);
  assert.deepEqual(run(body, englishBody.replace("Design", "Designing"), 2, [english]), [], "a changed translation is the same Skill and needs the same version");
  assert.match(run(body, englishBody, 2)[0] ?? "", /advanced without changing its content/u);
  assert.deepEqual(run(body, englishBody, 1, [english]), [], "the translation alone maps to the Skill's key");
  // 44B moves the system packs to packages/system-skills: an unchanged Skill that moved keeps its version, a changed one still advances.
  const moved = (currentBody: string, version: number) => {
    const before = new Map([["tooling/versions.json", table(1)], [file.replace("packages/system-skills/", "plugins/content/"), body]]);
    const after = new Map([["tooling/versions.json", table(version)], [file, currentBody]]);
    const old = file.replace("packages/system-skills/", "plugins/content/");
    return contentVersionChanges({ files: [old, file], read: (path: string) => after.get(path) }, (path: string) => before.get(path));
  };
  assert.deepEqual(moved(body, 1), [], "a moved Skill is compared with where it was");
  assert.match(moved(body.replace("设计与规划", "设计和规划"), 1)[0] ?? "", /changed content without advancing its version/u);
  // Only the old path of a moved Skill is let go: deleting one language of a Skill in place is still a change.
  const en = file.replace(/SKILL\.md$/u, "SKILL.en.md");
  const deleted = contentVersionChanges({ files: [file, en], read: (path: string) => (path === file ? body : path === "tooling/versions.json" ? table(1) : undefined) },
    (path: string) => (path === "tooling/versions.json" ? table(1) : path === file || path === en ? body : undefined));
  assert.match(deleted[0] ?? "", /changed content without advancing its version/u, "a deleted translation needs a new version");
});
