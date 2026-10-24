import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDirectoryPicker, runDirectoryPickerCommand, type DirectoryPickerCommandResult } from "../apps/local-host/src/directory-picker.ts";
import { handleProjectWorkspaceHttp, type ProjectWorkspaceHttpContext } from "../apps/local-host/src/project-workspace-http.ts";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

function commandResult(overrides: Partial<DirectoryPickerCommandResult> = {}): DirectoryPickerCommandResult {
  return { stdout: "", stderr: "", code: 0, ...overrides };
}

test("W2-18-DIRECTORY-PICKER-01 the default runner keeps the picker busy until its actual child exits", { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-picker-process-"));
  const started = path.join(directory, "started"), release = path.join(directory, "release");
  const script = `const fs = require('node:fs'); fs.writeFileSync(process.argv[1], 'ready');
    const timer = setInterval(() => { if (fs.existsSync(process.argv[2])) {
      clearInterval(timer); process.stdout.write(process.argv[3] + '\\n');
    } }, 10);`;
  const picker = createDirectoryPicker(undefined, () => ({ command: process.execPath, args: ["-e", script, started, release, directory] }));
  const pending = picker.pick();
  t.after(async () => { await writeFile(release, "finish"); await pending; await rm(directory, { recursive: true, force: true }); });
  let returned = false;
  void pending.then(() => { returned = true; }, () => { returned = true; });
  const deadline = Date.now() + 3_000;
  for (;;) {
    try { await readFile(started); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" || Date.now() >= deadline) throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(returned, false, "stdout is the completed output, never the ChildProcess stream");
  assert.deepEqual(await picker.pick(), { status: "busy" });
  await writeFile(release, "finish");
  assert.deepEqual(await pending, { status: "picked", path: directory });
});

test("W2-18-DIRECTORY-PICKER-01 actual child stdout, cancellation, failure, missing executable and timeout are distinguished", { timeout: 10_000 }, async () => {
  assert.deepEqual(await runDirectoryPickerCommand(process.execPath, ["-e", "process.stdout.write('picked\\n')"]), commandResult({ stdout: "picked\n" }));
  const cancelled = createDirectoryPicker(undefined, () => ({ command: process.execPath, args: ["-e", "process.exit(0)"] }));
  assert.deepEqual(await cancelled.pick(), { status: "cancelled" });
  const failed = await runDirectoryPickerCommand(process.execPath, ["-e", "process.stderr.write('failed'); process.exit(7)"]);
  assert.deepEqual([failed.code, failed.stderr], [7, "failed"]);
  assert.equal((await runDirectoryPickerCommand(path.join(tmpdir(), "molis-picker-executable-does-not-exist"), [])).missing, true);
  const timeout = await runDirectoryPickerCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 50);
  assert.equal(timeout.timedOut, true);
});

test("system folder window returns an existing absolute directory and ignores a trailing slash", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-workspace-pick-"));
  let command = "";
  let args: readonly string[] = [];
  const picker = createDirectoryPicker(async (nextCommand, nextArgs) => {
    command = nextCommand;
    args = nextArgs;
    return commandResult({ stdout: `${directory}/\n` });
  });
  const picked = await picker.pick();
  assert.deepEqual(picked, { status: "picked", path: directory });
  assert.equal(args[0] === "-e" || command === "zenity" || command === "powershell.exe", true);
  assert.equal(args.some((arg) => arg.includes(directory)), false);
  if (process.platform === "darwin") {
    assert.equal(command, "osascript");
    assert.match(args.join("\n"), /choose folder/);
    assert.equal(args.includes("-c"), false);
  }
});

test("folder window cancel, relative output, missing command, and a second click stay out of the project", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-workspace-pick-file-"));
  const file = path.join(directory, "note.txt");
  await writeFile(file, "x");
  const outcomes: DirectoryPickerCommandResult[] = [
    commandResult(),
    commandResult({ stdout: "notes" }),
    commandResult({ stdout: file }),
    commandResult({ missing: true, code: 1 }),
  ];
  const picker = createDirectoryPicker(async () => outcomes.shift()!);
  assert.deepEqual(await picker.pick(), { status: "cancelled" });
  assert.deepEqual(await picker.pick(), { status: "unavailable", message: "选中的路径不是这台电脑上的目录" });
  assert.deepEqual(await picker.pick(), { status: "unavailable", message: "选中的路径不是这台电脑上的目录" });
  assert.deepEqual(await picker.pick(), { status: "unavailable", message: "这台电脑打不开目录选择窗口" });

  let started = false;
  let release: (result: DirectoryPickerCommandResult) => void = () => undefined;
  const gate = new Promise<DirectoryPickerCommandResult>((resolve) => {
    release = resolve;
  });
  const busy = createDirectoryPicker(async () => {
    started = true;
    return gate;
  });
  const first = busy.pick();
  assert.equal(started, true);
  assert.deepEqual(await busy.pick(), { status: "busy" });
  release(commandResult({ stdout: directory }));
  assert.deepEqual(await first, { status: "picked", path: directory });
});

test("pick route reports the window result and does not open one without a project", async () => {
  const calls: Array<{ status: number; body: unknown }> = [];
  const base: ProjectWorkspaceHttpContext = {
    method: "POST",
    pathname: "/api/workspaces/pick",
    hasProject: true,
    actions: { discover: async () => [], invoke: () => Promise.reject(new Error("unused")) },
    readBody: async () => ({}),
    respond: (status, body) => {
      calls.push({ status, body });
    },
    pickDirectory: () => Promise.reject(new Error("unused")),
  };
  let opened = 0;
  await handleProjectWorkspaceHttp({
    ...base,
    hasProject: false,
    pickDirectory: async () => {
      opened += 1;
      return { status: "picked", path: "/tmp" };
    },
  });
  assert.equal(opened, 0);
  assert.deepEqual(calls.at(-1), { status: 400, body: { error: "请先选择 Project" } });

  const results = [
    { status: "picked" as const, path: "/tmp/repo" },
    { status: "cancelled" as const },
    { status: "busy" as const },
    { status: "unavailable" as const, message: "这台电脑打不开目录选择窗口" },
  ];
  for (const result of results) {
    await handleProjectWorkspaceHttp({ ...base, pickDirectory: async () => result });
  }
  assert.deepEqual(calls.slice(1).map((call) => call.body), [
    { path: "/tmp/repo" },
    { cancelled: true },
    { error: "目录选择窗口已经打开" },
    { error: "这台电脑打不开目录选择窗口" },
  ]);
  assert.deepEqual(calls.slice(1).map((call) => call.status), [200, 200, 409, 503]);
  // Every refusal answers by its kind and with its code (SC-3): an action service that is down or not redeemed is unavailable (503), a missing permission forbidden (403).
  for (const [failure, expectedStatus] of [
    [new ActionError("actions.service_unavailable", "项目目录服务尚未装配"), 503],
    [new ActionError("actions.input_invalid", "目录需要核对"), 400],
    [new ActionError("actions.forbidden", "没有目录权限"), 403],
    [new ActionError("host.workspace_not_found", "找不到当前 Project 的这条工作目录", { kind: "not_found" }), 404],
  ] as const) {
    let invoked = 0;
    await handleProjectWorkspaceHttp({ ...base, method: "PATCH", pathname: "/api/workspaces/current/path",
      readBody: async () => ({ workspace_path: "/tmp/next", user_confirmed: true }),
      actions: { discover: async () => [], invoke: async () => { invoked++; throw failure; } },
    });
    assert.equal(invoked, 1);
    assert.deepEqual(calls.at(-1), { status: expectedStatus, body: { error: failure.message, code: failure.code } });
  }
  // A folder id that is not valid percent-encoding is the caller's mistake: refused as invalid before any action runs.
  for (const [method, suffix] of [["POST", "unlink"], ["PATCH", "path"]]) {
    let invoked = 0;
    assert.equal(await handleProjectWorkspaceHttp({ ...base, method, pathname: `/api/workspaces/%E0%A4%A/${suffix}`,
      readBody: async () => ({ user_confirmed: true, workspace_path: "/tmp/next" }),
      actions: { discover: async () => [], invoke: async () => { invoked++; return {}; } },
    }), true, "the route answers malformed paths instead of throwing into the Host error logger");
    assert.deepEqual(calls.at(-1), { status: 400, body: { error: "请求路径里有无效的编码", code: "host.request_path_invalid" } });
    assert.equal(invoked, 0);
  }
  // Starting a Session in a folder stays with Work: the Host's folder routes leave that address alone.
  assert.equal(await handleProjectWorkspaceHttp({ ...base, pathname: "/api/workspaces/current/sessions" }), false);
});
