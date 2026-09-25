import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { feishuCliStatus } from "../apps/local-host/src/feishu-cli.ts";

/**
 * Connector reads ask whether the Feishu CLI is authorized on every web request. Running the CLI synchronously each
 * time stopped the whole server for up to three seconds per request, so only the first read, or one the user asked to
 * be fresh, waits for the CLI; the rest get the last answer, refreshed in the background once it is half a minute old.
 */
test("Feishu CLI status: repeated reads reuse the last answer; fresh reads and a new executable ask again; an old answer refreshes in the background", async t => {
  const directory = await mkdtemp(join(tmpdir(), "feishu-cli-status-"));
  const previous = { home: process.env.MOLIS_WORK_HOME, path: process.env.MOLIS_WORK_FEISHU_CLI_PATH };
  const calls = join(directory, "calls"), state = join(directory, "state");
  const fake = async (name: string) => {
    const file = join(directory, name);
    await writeFile(file, `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(calls)}, "x");
const user = fs.readFileSync(${JSON.stringify(state)}, "utf8").trim() === "yes";
console.log(JSON.stringify({ ok: true, identities: { user: { available: user, name: "Ada" } } }));
`);
    await chmod(file, 0o755);
    return file;
  };
  const count = async () => (await readFile(calls, "utf8").catch(() => "")).length;
  try {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    process.env.MOLIS_WORK_HOME = directory;
    process.env.MOLIS_WORK_FEISHU_CLI_PATH = await fake("lark-cli");
    await writeFile(state, "no");
    assert.equal(feishuCliStatus().authorized, false);
    for (let index = 0; index < 5; index++) feishuCliStatus();
    assert.equal(await count(), 1, "later reads do not run the CLI");

    await writeFile(state, "yes");
    assert.equal(feishuCliStatus().authorized, false, "a recent answer is reused");
    assert.equal(feishuCliStatus({ fresh: true }).authorized, true, "the settings page and a login ask again");
    assert.equal(await count(), 2);

    await writeFile(state, "no");
    t.mock.timers.tick(31_000);
    assert.equal(feishuCliStatus().authorized, true, "an old answer is served while it refreshes");
    for (let waited = 0; await count() < 3 || feishuCliStatus().authorized; waited++) {
      assert.ok(waited < 200, "the background refresh finished");
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(await count(), 3, "one refresh, however many reads");

    process.env.MOLIS_WORK_FEISHU_CLI_PATH = await fake("other-lark-cli");
    await writeFile(state, "yes");
    assert.equal(feishuCliStatus().authorized, true, "another executable is asked directly");
    assert.equal(await count(), 4);
  } finally {
    if (previous.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = previous.home;
    if (previous.path === undefined) delete process.env.MOLIS_WORK_FEISHU_CLI_PATH; else process.env.MOLIS_WORK_FEISHU_CLI_PATH = previous.path;
    await rm(directory, { recursive: true, force: true });
  }
});
