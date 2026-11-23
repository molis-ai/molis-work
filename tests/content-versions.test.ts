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
});
