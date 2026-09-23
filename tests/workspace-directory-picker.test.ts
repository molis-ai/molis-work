import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDirectoryPicker, type DirectoryPickerCommandResult } from "../apps/local-host/src/directory-picker.ts";
import { CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/coding-companions.ts";
import { handleWorkspaceHttp } from "../plugins/native/work/src/http/workspaces.ts";
import type { WorkSessionHttpContext } from "../plugins/native/work/src/http/types.ts";
import { renderWorkspaceWorkbench } from "../plugins/native/workspace/src/ui.ts";

function commandResult(overrides: Partial<DirectoryPickerCommandResult> = {}): DirectoryPickerCommandResult {
  return { stdout: "", stderr: "", code: 0, ...overrides };
}

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
  const respond: WorkSessionHttpContext["respond"] = (status, body) => {
    calls.push({ status, body });
  };
  const base = {
    method: "POST",
    pathname: "/api/workspaces/pick",
    readBody: async () => ({}),
    respond,
    resourcesPromise: new Promise(() => undefined),
    hasCurrentGoal: () => false,
    readGoalContract: () => {
      throw new Error("unused");
    },
    workspace: {
      add: () => Promise.reject(new Error("unused")),
      repair: () => Promise.reject(new Error("unused")),
      unlink: () => Promise.reject(new Error("unused")),
      isActionError: () => false,
      read: () => Promise.resolve(null),
      normalize: () => null,
      exists: () => false,
      isDirectory: () => false,
    },
  };
  let opened = 0;
  await handleWorkspaceHttp({
    ...base,
    projectOptions: { project: null, projects: [] },
    pickDirectory: async () => {
      opened += 1;
      return { status: "picked", path: "/tmp" };
    },
  });
  assert.equal(opened, 0);
  assert.deepEqual(calls.at(-1), { status: 400, body: { error: "请先选择 Project" } });

  const project = { project: { project_id: "project-1", display_name: "项目" }, projects: [] as const };
  const results = [
    { status: "picked" as const, path: "/tmp/repo" },
    { status: "cancelled" as const },
    { status: "busy" as const },
    { status: "unavailable" as const, message: "这台电脑打不开目录选择窗口" },
  ];
  for (const result of results) {
    await handleWorkspaceHttp({ ...base, projectOptions: project, pickDirectory: async () => result });
  }
  assert.deepEqual(calls.slice(1).map((call) => call.body), [
    { path: "/tmp/repo" },
    { cancelled: true },
    { error: "目录选择窗口已经打开" },
    { error: "这台电脑打不开目录选择窗口" },
  ]);
  assert.deepEqual(calls.slice(1).map((call) => call.status), [200, 200, 409, 503]);
});

test("workspace form asks for a folder window instead of a typed absolute path", () => {
  const html = renderWorkspaceWorkbench();
  assert.match(html, /data-workspace-pick/);
  assert.match(html, /选择目录/);
  assert.match(html, /name="confirmed"/);
  assert.doesNotMatch(html, /name="confirmed" required/);
  assert.match(CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT, /请确认将此目录关联到当前项目/);
  assert.doesNotMatch(html, /这台电脑上的绝对路径/);
  assert.equal(html.includes('placeholder='), false);
  assert.match(CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT, /\/api\/workspaces\/pick/);
  assert.match(CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT, /请先选择目录/);
});
