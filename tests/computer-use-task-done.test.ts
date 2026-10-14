import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDesk, ComputerRecords, ComputerSettings, desktopTaskComplete } from "@molis-ai/molis-work-app-local-host";

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

const presence = { locked: false, screensaver: false, displays_asleep: false, on_console: true, idle_seconds: 0 };
const permissions = { accessibility: true, screen_recording: true, input_monitoring: true };

function endedRound(window: { title: string; document?: string }) {
  const home = mkdtempSync(path.join(tmpdir(), "cu-done-"));
  const settings = new ComputerSettings(home);
  settings.setEnabled(true);
  const records = new ComputerRecords(home);
  const state = { bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: window.title, frame: [0, 0, 120, 80] as [number, number, number, number], window_id: 1, document: window.document ?? "" } };
  const desk = new ComputerDesk({
    settings, records,
    helper: {
      on: () => () => undefined, ready: true, unsupported: () => null, problem: () => null,
      status: () => ({ version: "test", pid: 1, bundle_id: "test.helper", permissions, presence, watching: false, last_synthetic: 0 }),
      ensure: async () => ({ version: "test", pid: 1, bundle_id: "test.helper", permissions, presence, watching: false, last_synthetic: 0 }),
      call: async <T>(op: string): Promise<T> => {
        if (op === "monitor" || op === "file.give" || op === "input.menu") return {} as T;
        if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
        if (op === "app.open" || op === "app.state") return state as T;
        if (op === "observe.screenshot") return { png: Buffer.from("window").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
        if (op === "observe.tree") return { window: { title: state.window.title, frame: state.window.frame }, nodes: [{ role: "AXButton", name: "保存", depth: 0, frame: [10, 10, 40, 20] }], truncated: false, menus: [] } as T;
        throw new Error(op);
      },
    },
  });
  return { home, desk, records };
}

async function finishRound(goal: string, window: { title: string; document?: string }, actions: readonly HostSurfaceAction[]) {
  const round = endedRound(window);
  try {
    const driver = round.desk.driver();
    driver.describeRound!("sess-molis", { run_id: "run-1", project_id: null, goal });
    for (const action of actions) await driver.perform(action, { session_id: "sess-molis" });
    const id = round.desk.state().record_id;
    assert.ok(id);
    await driver.release?.();
    return round.records.get(id);
  } finally {
    round.desk.close();
    rmSync(round.home, { recursive: true, force: true });
  }
}

test("a model run ending does not complete the desktop record unless the window, a file, or the record shows it", async () => {
  const said = await finishRound("窗口：备忘录\n文件：笔记.txt\n记录：已保存", { title: "未命名" }, [{ what: "app", app: "com.apple.TextEdit" }]);
  assert.equal(said?.outcome, "failed");
  assert.match(said?.conclusion ?? "", /模型说完成了/);

  const titled = await finishRound("窗口：备忘录", { title: "备忘录" }, [{ what: "app", app: "com.apple.TextEdit" }]);
  assert.equal(titled?.outcome, "completed");

  const filed = await finishRound("文件：笔记.txt", { title: "未命名" }, [
    { what: "app", app: "com.apple.TextEdit" },
    { what: "upload", from: ["笔记.txt"] },
  ]);
  assert.equal(filed?.outcome, "completed");

  const recorded = await finishRound("记录：已保存", { title: "未命名" }, [
    { what: "app", app: "com.apple.TextEdit" },
    { what: "menu", path: ["文件", "已保存"] },
  ]);
  assert.equal(recorded?.outcome, "completed");
});
