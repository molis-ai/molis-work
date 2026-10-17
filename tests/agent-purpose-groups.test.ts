// A role's methods for its purpose (user decision 2026-10-16): each role of an Agent may name the methods that go with what
// it is for — the ones a person may pick, and the ones already picked when a round of that role starts. The Manifest is
// refused when a role names a method the block does not declare, when a default is not among the allowed, or when an
// allowed method needs a tool the role cannot give: the Host refuses that selection at start anyway, so the author hears
// it at install, not the person at the first round. No built-in Plugin declares role methods yet.
import assert from "node:assert/strict";
import test from "node:test";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;

const method = (skill_id: string, tools: string[]): Part => ({ skill_id, version: 1, name: skill_id, summary: `${skill_id} 的做法`, tools });
const METHODS = [method("review", ["read-file", "search"]), method("implement", ["read-file", "search", "edit-file", "run-command"])];
const prompts = [{ prompt_id: "planner", version: 1 }, { prompt_id: "builder", version: 1 }];
const planner = { role_id: "planner", version: 1, name: "Planner", host_tools: ["read-file", "search"] };
const builder = { role_id: "builder", version: 1, name: "Builder", execution: "workspace-write", host_tools: ["read-file", "search", "edit-file", "run-command"] };

function problems(roles: Part[], skills: Part[] = METHODS): string {
  return manifestProblems(declarationManifest({ agent: { roles, prompts, skills } }));
}

test("a purpose's methods: each role names its own allowed and default methods", () => {
  assert.equal(problems([
    { ...planner, skills: { allowed: ["review"] } },
    { ...builder, skills: { allowed: ["implement", "review"], default: ["implement"] } },
  ]), "");
});

test("a role without methods of its own is checked as before", () => {
  assert.equal(problems([planner, builder]), "");
});

const REFUSED: ReadonlyArray<{ rule: string; roles: Part[]; expected: string }> = [
  { rule: "an empty allowed list", roles: [{ ...planner, skills: { allowed: [] } }], expected: "角色 planner 的方法声明不合法：allowed 至少一项，各项不重复" },
  { rule: "a method allowed twice", roles: [{ ...planner, skills: { allowed: ["review", "review"] } }], expected: "角色 planner 的方法声明不合法：allowed 至少一项，各项不重复" },
  { rule: "a method the block does not declare", roles: [{ ...planner, skills: { allowed: ["nowhere"] } }], expected: "角色 planner 引用了未声明的方法 nowhere" },
  { rule: "a default that is not allowed", roles: [{ ...builder, skills: { allowed: ["implement"], default: ["review"] } }], expected: "角色 builder 的默认方法 review 不在可选方法里" },
  { rule: "a method needing tools the role cannot give", roles: [{ ...planner, skills: { allowed: ["review", "implement"] } }], expected: "角色 planner 给不了方法 implement 要的工具：edit-file、run-command" },
  { rule: "a method on a role with no tools", roles: [{ role_id: "planner", version: 1, name: "Planner", skills: { allowed: ["review"] } }], expected: "角色 planner 给不了方法 review 要的工具：read-file、search" },
  { rule: "a method on a no-workspace role", roles: [{ role_id: "planner", version: 1, name: "Planner", workspace: "none", skills: { allowed: ["review"] } }],
    expected: "无工作区角色 planner 不能带方法；角色 planner 给不了方法 review 要的工具：read-file、search" },
];

for (const { rule, roles, expected } of REFUSED) {
  test(`a purpose's methods are refused at install: ${rule}`, () => {
    assert.equal(problems(roles), expected);
  });
}
