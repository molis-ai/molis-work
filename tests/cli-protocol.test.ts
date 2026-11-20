import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createStandaloneProject } from "./fixtures/standalone-project.js";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { cliFlagValue, dispatchCli, printCliLine, readCliJsonPayload, type CliCommandPorts } from "@molis-ai/molis-work-app-cli";
import { createMolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
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
    assert.doesNotMatch(help.join("\n"), /\b(?:init|snapshot|active-goal|goal-tree-[a-z]+)\b/, "PEQ-15: the help names no Goals command");
    assert.equal(existsSync(dirname(databasePath)), false);
    await assert.rejects(runV1Cli(["review-request", "--db", databasePath, "--json", "{"], { localHost: host }), {
      message: `Molis Work 数据库不存在: ${databasePath}`,
    });
    assert.equal(existsSync(dirname(databasePath)), false, "a command does not make the library it was pointed at");

    const projectId = "cli-input-board";
    await createStandaloneProject(databasePath, projectId);
    await assert.rejects(runV1Cli(["review-request", "--db", databasePath, "--json", "{"], { localHost: host }), SyntaxError);
    assert.equal(opens, 0, "failed input must not open a runtime");
    // PEQ-15: the Goals commands are gone; each is an unknown operation now.
    for (const operation of ["unknown", "init", "snapshot", "active-goal", "goal-tree-propose", "goal-tree-read", "goal-tree-check"]) {
      await assert.rejects(runV1Cli([operation, "--db", databasePath, "--project-id", projectId], { localHost: host }), {
        message: `未知 V1 operation: ${operation}`,
      }, operation);
    }
    assert.equal(host.status().state, "running", "the injected Host outlives the commands");
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
    // A flag with no value or a blank one names nothing, and neither does a --db followed by another flag (the flag must not be
    // taken for the database file).
    const flagAfter = ["--json", JSON.stringify({ project_id: "p" })];
    for (const args of [["review-request"], ["review-request", "--db"], ["review-request", "--db", ""], ["review-decide", "--db", "  "], ["review-decide"],
      ["review-request", "--db", ...flagAfter], ["review-decide", "--db", "--file", "payload.json"]]) {
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
