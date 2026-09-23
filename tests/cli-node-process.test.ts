import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CliAgentAdapter, createNodeCliProcessPort, type CliProcessEvent } from "@molis-ai/molis-work-service-agent-host";

test("passive CLI health never executes the program; an explicit run still launches it", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-cli-discovery-"));
  const command = join(directory, "coding-cli");
  const marker = join(directory, "was-executed");
  const previousPath = process.env.PATH;
  try {
    await writeFile(command, '#!/bin/sh\nprintf started > "$(dirname "$0")/was-executed"\nprintf "cli-result\\n"\n', { mode: 0o700 });
    const port = createNodeCliProcessPort();
    process.env.PATH = `${directory}:${previousPath ?? ""}`;
    assert.equal(await port.available("coding-cli"), true);
    assert.equal(await port.available(command), true);
    await symlink(command, join(directory, "linked-cli"));
    assert.equal(await port.available("linked-cli"), true);
    assert.equal(await port.available(directory), false);
    assert.equal(await port.available(join(directory, "missing")), false);
    assert.equal(await port.available(""), false);
    await chmod(command, 0o600);
    assert.equal(await port.available(command), false);
    await chmod(command, 0o700);
    const adapter = new CliAgentAdapter({ runtime_id: "test-cli", display_name: "Test CLI", command,
      process: port, model: async () => "test-model" });
    for (let index = 0; index < 3; index++) {
      const health = await adapter.health();
      assert.equal(health.status, "ready");
      assert.match(health.message ?? "", /登录状态在执行时确认/);
    }
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    const events: CliProcessEvent[] = [];
    await port.spawn({ command, args: [], cwd: directory, onEvent: event => events.push(event) }).done;
    assert.equal(await readFile(marker, "utf8"), "started");
    assert.deepEqual(events, [{ kind: "line", line: "cli-result" }, { kind: "exit", code: 0 }]);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});
