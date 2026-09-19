import assert from "node:assert/strict";
import test from "node:test";

import {
  CODING_FILE_CHANGED_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  codingManifest,
  parseCodingFileChanged,
  parseCodingWorkspaceInvalidated,
} from "@molis-ai/molis-work-plugin-coding";

/** Coding 发出的事件：路径会被别的插件拿去用，所以逐段校验而不是信任。 */

test("正常的工作区相对路径通过", () => {
  const parsed = parseCodingFileChanged({
    project_id: "p1", path: ["apps", "local-host", "src", "connect.ts"],
  });
  assert.deepEqual(parsed.path, ["apps", "local-host", "src", "connect.ts"]);
  assert.equal(parsed.project_id, "p1");
});

test("想爬出工作区的路径被拒，而不是被悄悄normalize掉", () => {
  for (const bad of [[".."], ["apps", ".."], ["."], ["a/b"], ["a\\b"], [""]]) {
    assert.throws(() => parseCodingFileChanged({ project_id: "p1", path: bad }),
      /path 路径片段无效/, `${JSON.stringify(bad)} 应当被拒`);
  }
});

test("控制字符一概拒绝，不只是空字节", () => {
  for (const code of [0, 9, 10, 13, 27, 31]) {
    assert.throws(
      () => parseCodingFileChanged({ project_id: "p1", path: [`a${String.fromCharCode(code)}b`] }),
      /path 路径片段无效/,
      `charCode ${code} 应当被拒`,
    );
  }
});

test("超长与超深的路径被拒", () => {
  assert.throws(() => parseCodingFileChanged({
    project_id: "p1", path: Array.from({ length: 65 }, () => "a"),
  }), /path 超出上限/);
  assert.throws(() => parseCodingFileChanged({
    project_id: "p1", path: ["a".repeat(256)],
  }), /path 路径片段无效/);
});

test("缺字段、空 project_id、空路径都被拒", () => {
  assert.throws(() => parseCodingFileChanged(null), /不是对象/);
  assert.throws(() => parseCodingFileChanged({ path: ["a"] }), /project_id 无效/);
  assert.throws(() => parseCodingFileChanged({ project_id: "  ", path: ["a"] }), /project_id 无效/);
  assert.throws(() => parseCodingFileChanged({ project_id: "p1", path: [] }), /path 无效/);
  assert.throws(() => parseCodingFileChanged({ project_id: "p1", path: [1] }), /必须是字符串/);
});

test("工作区失效事件带上评审与它对应的内容版本", () => {
  const parsed = parseCodingWorkspaceInvalidated({
    project_id: "p1", run_id: "r1", review: { review_id: "rev1", content_version: 3 },
  });
  assert.equal(parsed.review.content_version, 3,
    "消费方靠它判断评审是不是还对得上，不能靠假设");
});

test("内容版本不是整数就拒——它是用来比对的，不能是浮点或缺失", () => {
  for (const review of [{ review_id: "r" }, { review_id: "r", content_version: 1.5 }, { review_id: "", content_version: 1 }]) {
    assert.throws(() => parseCodingWorkspaceInvalidated({ project_id: "p", run_id: "r", review }));
  }
  assert.throws(() => parseCodingWorkspaceInvalidated({ project_id: "p", run_id: "r" }), /review 无效/);
});

test("声明的事件与带校验器的实现一一对应，不多不少", async () => {
  const { codingEventTypes } = await import("@molis-ai/molis-work-plugin-coding");
  const published = (codingManifest.events?.publishes ?? []).map((entry) => entry.event_type_id).sort();
  const implemented = codingEventTypes.map((type) => type.event_type_id).sort();
  assert.deepEqual(published, implemented,
    "声明了却没有校验器，或有校验器却没声明，都是对不上");
  assert.equal(published.includes(CODING_FILE_CHANGED_EVENT), true);
  assert.equal(published.includes(CODING_WORKSPACE_INVALIDATED_EVENT), true);
  // 每个事件 id 都必须在本插件命名空间下——平台会拒，这里先断住
  for (const id of published) {
    assert.match(id, /^io\.molis\.work\.coding\./, `${id} 不在插件命名空间下`);
  }
  assert.deepEqual(codingManifest.events?.subscribes, [], "Coding 目前不订阅任何人");
});

test("偏好事件只接受本插件声明过的角色", async () => {
  const { CODING_ROLE_IDS, parseCodingPreference } = await import("@molis-ai/molis-work-plugin-coding");
  for (const role_id of CODING_ROLE_IDS) {
    assert.equal(parseCodingPreference({ role_id, project_trusted: false }).role_id, role_id);
  }
  assert.throws(() => parseCodingPreference({ role_id: "hacker", project_trusted: true }),
    /不是这个插件声明过的角色/);
  assert.throws(() => parseCodingPreference({ role_id: "reader" }), /project_trusted 必须是布尔值/);
});

test("六个角色都在 Manifest 里，并且各自的 Prompt 都声明过", async () => {
  const { CODING_ROLE_IDS, codingAgentManifest, codingPrompts } =
    await import("@molis-ai/molis-work-plugin-coding");
  const declared = codingAgentManifest.roles.map((role) => role.role_id).sort();
  assert.deepEqual(declared, [...CODING_ROLE_IDS].sort());

  const promptIds = new Set(codingPrompts.map((prompt) => prompt.prompt_id));
  for (const role of codingAgentManifest.roles) {
    for (const promptId of role.prompts ?? []) {
      assert.equal(promptIds.has(promptId), true, `${role.role_id} 引用的 ${promptId} 没有正文`);
    }
  }
});

test("协调者与并行写入都是只读父角色，并要求子代理各自独立目录", async () => {
  const { codingAgentManifest } = await import("@molis-ai/molis-work-plugin-coding");
  for (const roleId of ["coordinator", "writers"]) {
    const role = codingAgentManifest.roles.find((entry) => entry.role_id === roleId);
    assert.equal(role?.execution, "read-only", `${roleId} 自己不该能改文件`);
    assert.equal(role?.subagent_workspaces, "required",
      `${roleId} 必须给每个子代理各自的目录`);
  }
});

test("只读角色拿不到会写的 Prompt", async () => {
  const { codingAgentManifest } = await import("@molis-ai/molis-work-plugin-coding");
  const writingPrompts = new Set(["coding-writer", "coding-builder"]);
  for (const role of codingAgentManifest.roles) {
    if (role.execution !== "read-only") continue;
    for (const promptId of role.prompts ?? []) {
      assert.equal(writingPrompts.has(promptId), false,
        `只读的 ${role.role_id} 不该拿到 ${promptId}`);
    }
  }
});
