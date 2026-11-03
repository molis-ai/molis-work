import { managementGoals } from "./goal-management-caller.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { cliFlagValue, cliGoalUrl, dispatchCli, printCliLine, readCliJsonPayload, type CliCommandPorts } from "@molis-ai/molis-work-app-cli";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { runV1Cli } from "@molis-ai/molis-work-app-local-host";

async function captureCli(operation: () => Promise<number>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
  try {
    assert.equal(await operation(), 0);
    return lines;
  } finally {
    console.log = original;
  }
}

test("RAC-112: plugin dispatch keeps successful arguments and catches synchronous and asynchronous failures", async t => {
  const errors: string[] = [];
  const output: string[] = [];
  t.mock.method(console, "error", (message: string) => { errors.push(message); });
  t.mock.method(console, "log", (message: string) => { output.push(message); });
  const unused = async () => assert.fail("a plugin command must not invoke a different port");
  const ports: CliCommandPorts = { home: unused, plugin: unused, install: unused, service: unused, demo: unused, uninstall: unused, v1: unused };
  const calls: string[][] = [];
  ports.plugin = async args => { calls.push(args); printCliLine("plugin result"); return 7; };
  assert.equal(await dispatchCli(["plugin", "list", "--json"], ports), 7);
  assert.deepEqual(calls, [["list", "--json"]]);
  assert.deepEqual(output, ["plugin result"]);
  assert.deepEqual(errors, []);

  ports.plugin = () => { throw new Error("sync failure"); };
  assert.equal(await dispatchCli(["plugin", "list"], ports), 1);
  assert.deepEqual(errors.splice(0), ["错误: sync failure"]);

  const pending = Promise.withResolvers<number>();
  ports.plugin = () => pending.promise;
  const dispatched = dispatchCli(["plugin", "install"], ports);
  pending.reject(new Error("async failure"));
  assert.equal(await dispatched, 1);
  assert.deepEqual(errors, ["错误: async failure"]);
});

test("CLI preserves first-flag and inline JSON precedence, file errors and Goal URL output", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-cli-input-"));
  try {
    const file = join(directory, "输入.json");
    writeFileSync(file, '{"title":"文件中的目标"}');
    assert.equal(cliFlagValue(["--db", "first", "--db", "second"], "--db"), "first");
    assert.equal(cliFlagValue(["--db"], "--db"), undefined);
    assert.deepEqual(readCliJsonPayload(["--file", file]), { title: "文件中的目标" });
    assert.deepEqual(readCliJsonPayload(["--file", join(directory, "missing.json"), "--json", '{"title":"inline"}']), { title: "inline" });
    assert.deepEqual(readCliJsonPayload([]), {});
    assert.throws(() => readCliJsonPayload(["--json", "{", "--file", file]), SyntaxError);
    assert.throws(() => readCliJsonPayload(["--file", join(directory, "missing.json")]), { code: "ENOENT" });
    assert.equal(cliGoalUrl("/goals/目标", "https://example.com/app/"), "https://example.com/goals/%E7%9B%AE%E6%A0%87");
    assert.throws(() => cliGoalUrl("/goals/a", "invalid"), { message: "无效的 Molis Work Web 地址: invalid" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI help and failed input retain storage side effects, error order and injected Host lifetime", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-cli-storage-"));
  const databasePath = join(directory, "nested", "project.db");
  let opens = 0;
  // Goals runs in the Host as a plugin of the project, which needs the Home the Host belongs to.
  const host = createMolisWorkLocalHost({ homeDirectory: join(directory, "home"), completeText: null, onRuntimeOpen: () => { opens += 1; } });
  try {
    const help = await captureCli(() => runV1Cli(["--help", "--db", databasePath, "--json", "{"], { localHost: host }));
    assert.match(help.join("\n"), /--db PATH is required[^\n]*There is no default path/);
    assert.doesNotMatch(help.join("\n"), /\.molis-work\/molis-work\.db/, "no default database path is advertised");
    assert.equal(existsSync(dirname(databasePath)), false);
    await assert.rejects(runV1Cli(["snapshot", "--db", databasePath, "--json", "{"], { localHost: host }), {
      message: `Molis Work 数据库不存在: ${databasePath}`,
    });
    assert.equal(existsSync(dirname(databasePath)), false);
    await assert.rejects(runV1Cli(["init", "--db", databasePath, "--json", "{"], { localHost: host }), SyntaxError);
    assert.equal(existsSync(dirname(databasePath)), true, "init prepares its parent before decoding JSON, as before");
    assert.equal(existsSync(databasePath), false);
    assert.equal(opens, 0, "failed input must not open a runtime");

    const input = { project_id: "cli-input-board", actor_id: "user", idempotency_key: "init" };
    const file = join(directory, "payload.json");
    writeFileSync(file, JSON.stringify(input));
    const output = await captureCli(() => runV1Cli(["init", "--db", databasePath, "--file", file], { localHost: host }));
    assert.match(output[0]!, /\n  "/, "JSON output remains indented");
    const reference = molisWorkHostProjectReference({ databasePath, projectId: input.project_id });
    const snapshot = await managementGoals(host.actionClient(reference), input.project_id).invoke(goalsActions.snapshot, {});
    assert.equal(snapshot.board.project_id, input.project_id);
    await assert.rejects(runV1Cli(["unknown", "--db", databasePath, "--project-id", input.project_id], { localHost: host }), {
      message: "未知 V1 operation: unknown",
    });
    assert.equal(host.status().state, "running");
    assert.equal(opens, 1);
    assert.deepEqual(await managementGoals(host.actionClient(reference), input.project_id).invoke(goalsActions.snapshot, {}), snapshot);
  } finally {
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI has no default database: a command without --db fails before it creates or opens anything in the working directory", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-cli-no-default-"));
  let opens = 0;
  const host = createMolisWorkLocalHost({ onRuntimeOpen: () => { opens += 1; } });
  const previous = process.cwd();
  process.chdir(directory);
  try {
    // `init` is the command that would have created the default path; a flag with no value or a blank one names nothing either,
    // and neither does a --db followed by another flag (the flag must not be taken for the database file).
    const flagAfter = ["--json", JSON.stringify({ project_id: "p" })];
    for (const args of [["init"], ["init", "--db"], ["init", "--db", ""], ["snapshot", "--db", "  "], ["active-goal"], ["init", "--db", ...flagAfter], ["snapshot", "--db", "--file", "payload.json"]]) {
      await assert.rejects(runV1Cli(args, { localHost: host }), { message: /需要 --db PATH/ }, args.join(" "));
    }
    assert.deepEqual(readdirSync(directory), [], "nothing is created relative to the working directory");
    assert.equal(opens, 0);
  } finally {
    process.chdir(previous);
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A Host that notes the call number in force each time a Goals action is called on the client the CLI was given. */
class NumberedHost extends MolisWorkLocalHost {
  readonly seen: Array<{ capability_id: string; id: string | undefined }> = [];
  override actionClient(reference: LocalHostProjectReference, preparePlugins = true): ActionClient {
    const real = super.actionClient(reference, preparePlugins);
    return { ...real, invoke: (caller, action, input) => { this.seen.push({ capability_id: action.capability_id, id: currentCallId() }); return real.invoke(caller, action, input); } };
  }
}

test("one CLI command is one operation: everything it calls shares a call number, and the next command has its own", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-cli-call-id-"));
  const databasePath = join(directory, "project.db");
  const host = new NumberedHost({ homeDirectory: join(directory, "home"), completeText: null });
  try {
    const input = { project_id: "cli-call-id", actor_id: "user", idempotency_key: "init" };
    await captureCli(() => runV1Cli(["init", "--db", databasePath, "--json", JSON.stringify(input)], { localHost: host }));
    const init = host.seen.filter(entry => entry.capability_id.startsWith("goals.")).splice(0);
    host.seen.length = 0;
    await captureCli(() => runV1Cli(["snapshot", "--db", databasePath, "--json", JSON.stringify({ project_id: input.project_id })], { localHost: host }));
    const snapshot = host.seen.filter(entry => entry.capability_id.startsWith("goals."));
    assert.deepEqual(init.map(entry => entry.capability_id), ["goals.board.initialize"], "init is one Goals action");
    assert.deepEqual(snapshot.map(entry => entry.capability_id), ["goals.snapshot.read"]);
    assert.ok(init[0]!.id, "the command opened an operation");
    assert.ok(snapshot[0]!.id && snapshot[0]!.id !== init[0]!.id, "the next command is another operation");
    assert.equal(currentCallId(), undefined, "the number ends with the command");
  } finally {
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
