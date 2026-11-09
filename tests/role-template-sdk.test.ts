import assert from "node:assert/strict";
import test from "node:test";

import type { RoleTemplate } from "@molis-ai/molis-work-contracts/modules/characters";
import {
  assertSandboxJson, assertSandboxMatches, assertSandboxSchema, inspectRoleTemplate,
  type RoleTemplateInspectionOptions, type SandboxSchemaFailure,
} from "@molis-ai/molis-work-plugin-sdk";

const draft = { source: "draft" } as const;
const pack = { source: "package", owner: "io.molis.work.weekly" } as const;
const draftRole: RoleTemplate = { title: { literal: "Draft role" }, instructions: "" };
const packageRole: RoleTemplate = { title: { key: "weekly.role.editor" }, instructions: "" };
const action = { capability_id: "notes.list", version: 1, provider_id: "system.connectors#mcp:notes" };
const skill = { pack: "io.molis.work.notes", skill_id: "draft-summary" };

function assertProblem(value: unknown, path: string, reason: RegExp, options: RoleTemplateInspectionOptions = draft): void {
  const problems = inspectRoleTemplate(value, options);
  const problem = problems.find(problem => problem.path === path);
  assert.ok(problem, `Expected a problem at ${path}, received ${JSON.stringify(problems)}`);
  assert.match(problem.reason, reason);
}

test("SPC-C06: public role inspection accepts package and draft content without changing the input", () => {
  const role: RoleTemplate = {
    title: { key: "weekly.role.editor", args: [{ name: "count", kind: "number", number: 2 }] },
    instructions: "Review the draft and summarize changes.",
    host_tools: ["ask-user"],
    action_tools: [action],
    skills: [skill],
    materials: { key: "weekly.role.materials", fallback: "Draft notes" },
    outputs: { key: "common.done" },
    works_with: ["writer"],
  };
  const original = structuredClone(role);
  assert.deepEqual(inspectRoleTemplate(role, pack), []);
  assert.deepEqual(role, original);
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, materials: { literal: "Issue notes" }, outputs: { literal: "Summary" } }, draft), []);
});

test("SPC-C06: the caller selects the text mode and package owner for every reference", () => {
  for (const field of ["title", "materials", "outputs"]) {
    assertProblem({ ...packageRole, [field]: { literal: "Hard-coded" } }, `$.${field}`, /不收 literal/u, pack);
    assertProblem({ ...draftRole, [field]: { key: "weekly.role.editor" } }, `$.${field}`, /不收键/u);
    assertProblem({ ...packageRole, [field]: { key: "notes.role.editor" } }, `$.${field}`, /本包的文字前缀/u, pack);
  }
  assertProblem(packageRole, "$", /插件 ID/u, { source: "package", owner: "weekly" });
  assertProblem({ ...packageRole, title: { key: "weekly.role.editor", owner: pack.owner } }, "$.title", /不能写 owner/u, pack);
});

test("SPC-C06: TextRef keeps its shared exclusivity, argument and length rules", () => {
  assertProblem({ ...packageRole, title: { key: "weekly.role.editor", literal: "Both" } }, "$.title", /只能写一个/u, pack);
  assertProblem({ ...packageRole, materials: { key: "weekly.role.materials", args: [{ name: "count", kind: "number" }] } }, "$.materials", /有限的数字/u, pack);
  const count = { name: "count", kind: "number", number: 1 };
  assertProblem({ ...packageRole, outputs: { key: "weekly.role.outputs", args: [count, count] } }, "$.outputs", /重复的 name/u, pack);
  assertProblem({ ...draftRole, title: { literal: "🧪".repeat(1001) } }, "$.title", /2000/u);
  assert.deepEqual(inspectRoleTemplate({ ...packageRole, title: { key: "weekly.role.editor", literal: undefined } }, pack), []);
});

test("SPC-C06: role instructions allow empty text and count UTF-16 units", () => {
  const limit = "🧪".repeat(10_000);
  assert.deepEqual(inspectRoleTemplate(draftRole, draft), []);
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, instructions: limit }, draft), []);
  assertProblem({ ...draftRole, instructions: `${limit}x` }, "$.instructions", /20000.*UTF-16/u);
  assertProblem({ title: draftRole.title }, "$.instructions", /字符串/u);
  assertProblem({ instructions: "" }, "$.title", /对象/u);
});

test("SPC-C06: tool lists preserve inheritance, explicit emptiness and Host name checks", () => {
  for (const toolLists of [{}, { host_tools: null, action_tools: null }, { host_tools: [], action_tools: [] }]) {
    assert.deepEqual(inspectRoleTemplate({ ...draftRole, ...toolLists }, draft), []);
  }
  const hostTools = Array.from({ length: 100 }, (_, index) => `tool-${index}`);
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, host_tools: hostTools }, draft), []);
  assertProblem({ ...draftRole, host_tools: [...hostTools, "extra"] }, "$.host_tools", /工具范围/u);
  assertProblem({ ...draftRole, host_tools: ["ask-user", "ask-user"] }, "$.host_tools", /重复/u);
  assertProblem({ ...draftRole, host_tools: ["Ask_User"] }, "$.host_tools", /工具范围/u);
  assertProblem({ ...draftRole, host_tools: new Array<string>(1) }, "$.host_tools", /bounded JSON/u);
});

test("SPC-C06: action tools reuse exact parser rules and refuse extra fields", () => {
  const maxProvider = "🧪".repeat(256);
  const actions = Array.from({ length: 100 }, (_, index) => ({ ...action, version: index + 1 }));
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, action_tools: actions }, draft), []);
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, action_tools: [{ ...action, provider_id: maxProvider }] }, draft), []);
  assertProblem({ ...draftRole, action_tools: [...actions, { ...action, version: 101 }] }, "$.action_tools", /100/u);
  assertProblem({ ...draftRole, action_tools: [action, action] }, "$.action_tools", /Duplicate/u);
  for (const reference of [
    { capability_id: action.capability_id, version: action.version },
    { ...action, capability_id: "bad capability" },
    { ...action, version: Number.MAX_SAFE_INTEGER + 1 },
    { ...action, provider_id: `${maxProvider}x` },
    { ...action, provider_id: "system.connectors\u0000" },
  ]) {
    assertProblem({ ...draftRole, action_tools: [reference] }, "$.action_tools", /exact identity/u);
  }
  assertProblem({ ...draftRole, action_tools: [{ ...action, approval: true }] }, "$.action_tools[0].approval", /不认识字段/u);
});

test("SPC-C06: Skill references use package and token rules across packs, and collaborators are locally unique IDs", () => {
  const skills = Array.from({ length: 129 }, (_, index) => ({ ...skill, pack: `io.molis.work.pack-${index}` }));
  assert.deepEqual(inspectRoleTemplate({ ...draftRole, skills, works_with: ["writer", "not-looked-up-here"] }, draft), []);
  assertProblem({ ...draftRole, skills: [{ ...skill, pack: "notes" }] }, "$.skills[0].pack", /插件 ID/u);
  assertProblem({ ...draftRole, skills: [{ ...skill, skill_id: "Draft_Summary" }] }, "$.skills[0].skill_id", /Skill 标识/u);
  assertProblem({ ...draftRole, skills: [{ ...skill, version: 1 }] }, "$.skills[0].version", /不认识字段/u);
  assertProblem({ ...draftRole, works_with: [" "] }, "$.works_with[0]", /非空/u);
  assertProblem({ ...draftRole, works_with: ["writer", "writer"] }, "$.works_with[1]", /重复/u);
});

test("SPC-C06: the template rejects injected authority and undeclared fields", () => {
  for (const field of ["actor_id", "project_id", "member_id", "install_id", "source", "origin", "owner", "approval", "extra"]) {
    assertProblem({ ...draftRole, [field]: "forged" }, `$.${field}`, /不认识字段/u);
  }
  assertProblem(Object.create(draftRole), "$", /对象/u);
  assertProblem([draftRole], "$", /对象/u);
});

test("the shared sandbox validators bound JSON and use the caller's error adapter through the SDK root", () => {
  const fail: SandboxSchemaFailure = (kind, reason) => assert.fail(`${kind} ${reason}`);
  const schema: unknown = {
    type: "object", properties: { choices: { type: "array", maxItems: 1, items: { type: "integer" } } },
    required: ["choices"], additionalProperties: false,
  };
  assertSandboxSchema(schema, fail);
  assertSandboxJson({ choices: [2] }, fail);
  assertSandboxMatches(schema, { choices: [2] }, fail);
  assert.throws(() => assertSandboxMatches(schema, { choices: [2, 3] }, fail, "$.setting"), /schema_mismatch \$\.setting\.choices: too many items/u);
  assert.throws(() => assertSandboxSchema({ type: "string", pattern: ".*" }, fail), /invalid_schema.*Unsupported schema keyword/u);
  let deep: unknown = null;
  for (let index = 0; index < 33; index++) deep = [deep];
  assert.throws(() => assertSandboxJson(deep, fail), /invalid_json.*JSON structure exceeds limits/u);
});
