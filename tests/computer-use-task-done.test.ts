import assert from "node:assert/strict";
import test from "node:test";
import { desktopTaskComplete } from "@molis-ai/molis-work-app-local-host";

test("a desktop task is finished only when a window title, a file, or the record shows it", () => {
  const wanted = { windowTitle: "备忘录", file: "笔记.txt", record: "已保存" };
  const said = desktopTaskComplete(wanted, { windowTitle: "未命名", files: [], record: ["模型说完成了"] }, true);
  assert.equal(said.complete, false);
  assert.match(said.reason, /模型说完成了/);

  const titled = desktopTaskComplete({ windowTitle: "备忘录" }, { windowTitle: "备忘录" }, false);
  assert.equal(titled.complete, true);
  const filed = desktopTaskComplete({ file: "笔记.txt" }, { files: ["笔记.txt"] }, false);
  assert.equal(filed.complete, true);
  const recorded = desktopTaskComplete({ record: "已保存" }, { record: ["写入 笔记.txt：已保存"] }, true);
  assert.equal(recorded.complete, true);
});
