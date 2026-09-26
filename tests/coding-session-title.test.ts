import assert from "node:assert/strict";
import test from "node:test";
import { codingSessionTitleFrom, DEFAULT_SESSION_TITLE } from "@molis-ai/molis-work-plugin-coding";

test("a default-named session takes the first meaningful line of its first task", () => {
  assert.equal(codingSessionTitleFrom("npm test 现在是失败的。请找出原因并修复。"), "npm test 现在是失败的。请找出原因并修复。");
  assert.equal(codingSessionTitleFrom("\n\n## 修复 `login` 重试\n细节在下面"), "修复 login 重试");
  assert.equal(codingSessionTitleFrom("   \n"), DEFAULT_SESSION_TITLE);
  const long = "把".repeat(50);
  assert.equal(Array.from(codingSessionTitleFrom(long)).length, 36);
  assert.ok(codingSessionTitleFrom(long).endsWith("…"));
});
