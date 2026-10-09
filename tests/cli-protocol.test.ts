import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { cliFlagValue, cliGoalUrl, readCliJsonPayload } from "@molis-ai/molis-work-app-cli";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, snapshotBoardCapability } from "@molis-ai/molis-work-app-local-host";
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
  const host = createMolisWorkLocalHost({ onRuntimeOpen: () => { opens += 1; } });
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

    const input = { project_id: "cli-input-board", title: "从文件初始化", actor_id: "user", idempotency_key: "init" };
    const file = join(directory, "payload.json");
    writeFileSync(file, JSON.stringify(input));
    const output = await captureCli(() => runV1Cli(["init", "--db", databasePath, "--file", file], { localHost: host }));
    assert.match(output[0]!, /\n  "/, "JSON output remains indented");
    const reference = molisWorkHostProjectReference({ databasePath, projectId: input.project_id });
    const snapshot = await host.client(reference).invoke(snapshotBoardCapability, { project_id: input.project_id });
    assert.equal(snapshot.board.title, "从文件初始化");
    await assert.rejects(runV1Cli(["unknown", "--db", databasePath, "--project-id", input.project_id], { localHost: host }), {
      message: "未知 V1 operation: unknown",
    });
    assert.equal(host.status().state, "running");
    assert.equal(opens, 1);
    assert.deepEqual(await host.client(reference).invoke(snapshotBoardCapability, { project_id: input.project_id }), snapshot);
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
