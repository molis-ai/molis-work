import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// W4-09 (roadmap §4.11): the Host's periodic tasks are registered in one place, shown in 设置 › 诊断, and gone when the server stops.

/** Every interval created while `run` sets things up, and which of them are still running. */
function trackIntervals() {
  const live = new Set<ReturnType<typeof setInterval>>();
  const [create, clear] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => { const timer = create(...args); live.add(timer); return timer; }) as typeof setInterval;
  globalThis.clearInterval = ((timer?: Parameters<typeof clearInterval>[0]) => { live.delete(timer as ReturnType<typeof setInterval>); clear(timer); }) as typeof clearInterval;
  return { live, restore: () => { globalThis.setInterval = create; globalThis.clearInterval = clear; } };
}

async function start(home: string) {
  const web = createMolisWorkWebServer({ homeDirectory: home, controlToken: "periodic-tasks-control-token-for-the-test", deletionSweepMs: 50 });
  await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
  const address = web.address(); assert.ok(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => web.close(() => resolve())) };
}

test("W4-09-01: 设置 › 诊断 lists the server's periodic tasks from their one registry, with how their last run went", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "periodic-tasks-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const web = await start(home);
  t.after(web.close);
  const section = async () => {
    const html = await (await fetch(web.origin + "/settings/diagnostics")).text();
    const found = html.match(/<section[^>]*data-periodic-tasks[^>]*>([\s\S]*?)<\/section><\/section>|<section[^>]*data-periodic-tasks[^>]*>[\s\S]*?(?=<section class="settings-section" aria-labelledby="launcher-title")/);
    assert.ok(found, "the diagnostics page has a 后台任务 section");
    return found[0];
  };
  const first = await section();
  for (const title of ["项目里的定时任务", "完成上次没删完的项目", "为进行中的工作找新资料", "到期提醒", "清理过期的桌面截图"]) assert.ok(first.includes(title), title);
  assert.match(first, /每 30 秒/);
  assert.match(first, /每小时/);
  // The leftover-deletion sweep runs every 50 ms here: its row turns from waiting to a finished run.
  const deadline = Date.now() + 10_000;
  let row = "";
  while (Date.now() < deadline) {
    row = (await section()).split("完成上次没删完的项目")[1]!.split("</section>")[0]!;
    if (row.includes("上次 ")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(row, /上次 \d\d:\d\d/);
  assert.match(row, /settings-state--success/);
});

test("W4-09-02: starting and stopping the server again and again leaves no interval running", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "periodic-tasks-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (let round = 0; round < 3; round++) {
    const intervals = trackIntervals();
    let web: Awaited<ReturnType<typeof start>>;
    try {
      web = await start(home);
      await fetch(web.origin + "/settings/diagnostics");
      assert.ok(intervals.live.size >= 5, `round ${round}: the server's tasks are running (${intervals.live.size})`);
      await web.close();
      // Closing hands the shutdown to the next turns of the event loop.
      for (let wait = 0; wait < 50 && intervals.live.size; wait++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(intervals.live.size, 0, `round ${round}: every interval the server started is cleared when it stops`);
    } finally { intervals.restore(); }
  }
});
