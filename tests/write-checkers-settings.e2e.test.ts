import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { join } from "node:path";
import type { AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { addProjectInputFolder, changeProjectDirectories, projectOutputOf, setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const section = "[data-write-checkers]";
const editor = `${section} [data-wc=dialog]`;
const row = (id: string) => `${section} [data-checker="${id}"]`;
const add = `${section} [data-act=add]`;
const submit = `${editor} [type=submit]`;

async function fixture(t: TestContext) {
  const browser = await openGoalBrowser(t, "user");
  assert.ok(browser, "Chrome must be available for the settings journey");
  const { command, sessionId, navigate, origin, projectId, homeDirectory, web, evaluate, waitFor, click } = browser;
  const path = join(homeDirectory, "workspace");
  await mkdir(path);
  const prefix = `/projects/${projectId}`;
  // The folder is this project's output, where a round writes and the checks run (SSC-15); another project also reads it, so taking it
  // back from this one keeps the folder's row and its id, and with them the list saved for it.
  const neighbour = await createProject(web, "也读这个文件夹");
  await addProjectInputFolder(web, neighbour.project_id, path);
  const linked = { workspace: await setProjectOutputFolder(web, projectId, path) };
  const route = prefix + "/api/project-settings/write-checkers";
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/workspaces" }, sessionId));
  await waitFor(`document.querySelector(${JSON.stringify(add)})`);
  const fields = async (values: Record<string, string>) => {
    await evaluate(`(() => { const form = document.querySelector('${editor} form');
      for (const [name, value] of Object.entries(${JSON.stringify(values)})) {
        const input = form.elements.namedItem(name); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
      } })()`);
  };
  const lists = async () => (await web.get<{ lists: AgentWriteCheckerList[] }>(route)).lists;
  const saved = async () => {
    await waitFor(`!document.querySelector('${editor}').open`);
    return (await lists())[0];
  };
  const focus = async (selector: string) => {
    await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
  };
  const create = async (name: string) => {
    await click(add);
    await fields({ display_name: name, executable: "node", args: "--check {file}", applies_to: ".js .mjs", timeout_seconds: "2.5" });
    await click(submit);
    return saved();
  };
  return { ...browser, prefix, route, workspace: linked.workspace.workspace_id, path, fields, lists, saved, focus, create };
}

test("PA-40 PA-42 PA-43 real settings save and reread milliseconds, move/delete only the chosen checker, and restore keyboard focus", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const { click, evaluate, waitFor, fields, focus, command, sessionId } = f;
  const first = await f.create("Node 语法");
  assert.equal(first.version, 1);
  assert.equal(first.checkers[0].timeout_ms, 2500);
  await focus(add);
  const args = ["--check", 'say "hello"', "C:\\tools\\checker", "", "two words", "tail\\", "{file}"];
  await f.web.post(f.route, { workspace_id: f.workspace, expected_version: first.version, checkers: [{ ...first.checkers[0], args }] });
  await f.reloadPage();
  await waitFor(`document.querySelector('${row("node")}')`);
  await click(`${row("node")} [data-act=edit]`);
  assert.equal(await evaluate(`document.querySelector('${editor} [name=timeout_seconds]').value`), "2.5");
  assert.equal(await evaluate(`document.querySelector('${editor} form').checkValidity()`), true);
  await fields({ display_name: "Node 修改" });
  await click(submit);
  const edited = await f.saved();
  assert.equal(edited.checkers[0].display_name, "Node 修改");
  assert.equal(edited.checkers[0].timeout_ms, 2500);
  assert.deepEqual(edited.checkers[0].args, args, "PA-42 changing the name in the real editor preserves every saved argument");
  await focus(`${row("node")} [data-act=edit]`);
  await f.create("第二个检查器");
  await click(`${row("node-2")} [data-act=up]`);
  await waitFor(`document.querySelector('${section} [data-checker]')?.dataset.checker === 'node-2'`);
  assert.deepEqual((await f.lists())[0].checkers.map(checker => checker.checker_id), ["node-2", "node"]);
  await focus(add);

  await click(`${row("node")} [data-act=edit]`);
  await click(`${editor} footer [data-dialog-close]`);
  await focus(`${row("node")} [data-act=edit]`);
  const question = `${section} [data-slot=alert-dialog]`;
  const remove = `${row("node-2")} [data-act=remove]`;
  const before = await f.lists();
  await click(remove);
  await waitFor(`document.querySelector('${question}')?.open`);
  await click(`${question} footer [data-dialog-close]`);
  await focus(remove);
  assert.deepEqual(await f.lists(), before, "Cancel writes nothing");
  await click(remove);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await focus(remove);
  assert.deepEqual(await f.lists(), before, "Esc writes nothing");
  await click(remove);
  await click(`${question} [value=remove]`);
  await waitFor(`!document.querySelector('${row("node-2")}')`);
  await focus(add);
  assert.deepEqual((await f.lists())[0].checkers.map(checker => checker.checker_id), ["node"]);

  // The same section also works when the Workbench loads it into its settings surface.
  await f.navigate(() => command("Page.navigate", { url: `${f.origin}${f.prefix}/?desktop=1` }, sessionId));
  await click(".navigator-project-settings");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor(`document.querySelector('${row("node")}')`);
  await click(`${row("node")} [data-act=edit]`);
  await fields({ display_name: "Changed in the Workbench" });
  await click(submit);
  assert.equal((await f.saved()).checkers[0].display_name, "Changed in the Workbench");
  await focus(`${row("node")} [data-act=edit]`);
});

test("PA-41 PA-43 conflict and failed reread preserve the form; revoking the folder prevents every later write", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const { click, fields, evaluate, waitFor, web, route, command, sessionId, focus } = f;
  const first = await f.create("Original");
  const changeElsewhere = (kept: AgentWriteCheckerList) => web.post<AgentWriteCheckerList>(route, {
    workspace_id: f.workspace, expected_version: kept.version, checkers: kept.checkers.map(checker => ({ ...checker, display_name: "Elsewhere" })),
  });
  await click(`${row("node")} [data-act=edit]`);
  await fields({ display_name: "My unsaved name", timeout_seconds: "2.5" });
  const newer = await changeElsewhere(first);
  await click(submit);
  await waitFor(`document.querySelector('${editor} [data-wc=error]').textContent.includes('已重新读取')`);
  assert.equal(await evaluate(`document.querySelector('${editor}').open`), true);
  assert.equal(await evaluate(`document.querySelector('${editor} [name=display_name]').value`), "My unsaved name");
  assert.deepEqual(await f.lists(), [newer], "the stale request did not write");
  await click(`${editor} footer [data-dialog-close]`);
  await focus(`${row("node")} [data-act=edit]`);

  await click(`${row("node")} [data-act=edit]`);
  await fields({ display_name: "Still unsaved" });
  const latest = await changeElsewhere(newer);
  // Only the reread loses its connection; the preceding POST reaches the real Host and is refused as stale.
  const failures: unknown[] = [];
  const off = f.on("Fetch.requestPaused", params => {
    const request = params.request as { method: string };
    void command(request.method === "GET" ? "Fetch.failRequest" : "Fetch.continueRequest",
      { requestId: params.requestId, ...(request.method === "GET" ? { errorReason: "ConnectionRefused" } : {}) }, sessionId).catch(error => failures.push(error));
  });
  await command("Fetch.enable", { patterns: [{ urlPattern: "*api/project-settings/write-checkers", requestStage: "Request" }] }, sessionId);
  try {
    await click(submit);
    await waitFor(`document.querySelector('${editor} [data-wc=error]').textContent.includes('连不上')`);
    assert.equal(await evaluate(`document.querySelector('${editor} [name=display_name]').value`), "Still unsaved");
    assert.equal(await evaluate(`document.querySelector('${editor}').open`), true);
    assert.deepEqual(await f.lists(), [latest]);
  } finally { await command("Fetch.disable", {}, sessionId); off(); }
  assert.deepEqual(failures, []);
  await click(`${editor} footer [data-dialog-close]`);
  await focus(`${row("node")} [data-act=edit]`);

  await f.reloadPage();
  await waitFor(`document.querySelector('${row("node")}')`);
  await click(`${row("node")} [data-act=edit]`);
  await fields({ display_name: "Must not be saved" });
  // The person sets the output back to the default location: the folder leaves this project, and the default output is its one group.
  const defaultOutput = projectOutputOf(await changeProjectDirectories(web, f.projectId, "set_output", { default_output: true })).workspace_id;
  await click(submit);
  await waitFor(`!document.querySelector('${editor} [data-wc=error]').hidden && !document.querySelector('${submit}').disabled`);
  assert.equal(await evaluate(`document.querySelector('${editor}').open`), true);
  assert.equal(await evaluate(`document.querySelector('${editor} [name=display_name]').value`), "Must not be saved");
  assert.deepEqual(await f.lists(), [{ workspace_id: defaultOutput, version: 0, checkers: [] }]);
  const linked = await setProjectOutputFolder(web, f.projectId, f.path);
  assert.equal(linked.workspace_id, f.workspace);
  assert.deepEqual(await f.lists(), [latest], "re-authorizing reveals the unchanged saved list and version");
});

test("PA-40 PA-43 settings remain readable in Chinese/English, light/dark, and wide/tablet/narrow viewports", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const { command, sessionId, evaluate, waitFor, click } = f;
  await f.create("Node syntax");
  await click(`${row("node")} [data-act=edit]`);
  await f.fields({ args: `--check --title "${"long-argument-".repeat(12)}" {file}` });
  await click(submit);
  await f.saved();
  const shots = reviewEvidenceUrl("write-checkers-settings/");
  await mkdir(shots, { recursive: true });
  for (const locale of ["zh", "en"]) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: f.origin, path: "/" }, sessionId);
    for (const [width, theme] of [[1440, "light"], [1024, "dark"], [390, "light"]] as const) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
      await f.reloadPage();
      await waitFor(`document.querySelector('${row("node")}')`);
      assert.equal(await evaluate("document.documentElement.dataset.theme"), theme);
      await evaluate(`document.querySelector('${section}').scrollIntoView({ block: 'start', behavior: 'instant' })`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.settings-content')].every(node => node.scrollWidth <= node.clientWidth + 1)`), true, `${locale}/${width}/${theme}: no horizontal overflow`);
      assert.equal(await evaluate(`document.querySelector('${section} h2').textContent`), locale === "en" ? "After-write checks" : "写后检查");
      await writeFile(new URL(`${locale}-${width}-${theme}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
      await click(`${row("node")} [data-act=edit]`);
      assert.equal(await evaluate(`document.querySelector('${editor} form').checkValidity()`), true);
      await writeFile(new URL(`${locale}-${width}-${theme}-editor.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
      await click(`${editor} footer [data-dialog-close]`);
    }
  }
});

test("QA-029: a real two-tab conflict and invalid program leave the complete error beside usable actions", { timeout: 180_000 }, async t => {
  const f = await fixture(t);
  await f.create("Syntax check");
  const second = await f.openPage();
  const url = `${f.origin}${f.prefix}/?desktop=1`;
  const edit = `${row("node")} [data-act=edit]`;
  const cancel = `${editor} footer [data-dialog-close]`;
  const alert = `${editor} [data-wc=error]`;
  const field = (name: string) => `${editor} [name=${name}]`;
  const value = (name: string) => f.evaluate<string>(`document.querySelector('${field(name)}').value`);
  const shots = new URL("../.impeccable/qa/review/batch27-write-checkers/", import.meta.url);
  await mkdir(shots, { recursive: true });
  const shown = () => f.waitFor(`document.querySelector('${editor}').open && !document.querySelector('${alert}').hidden && !document.querySelector('${submit}').disabled && document.querySelector('${alert}').textContent.trim()`);
  const snapshot = async (name: string) => {
    const image = await f.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, f.sessionId);
    await writeFile(new URL(`${name}.png`, shots), Buffer.from(image.data, "base64"));
    return f.evaluate(`(() => {
      const alert = document.querySelector('${alert}');
      const text = document.createRange();
      text.selectNodeContents(alert);
      const fullyHit = (node, box) => box.width > 0 && box.height > 0
        && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        && [box.top + 1, box.bottom - 1].every(y => node.contains(document.elementFromPoint((box.left + box.right) / 2, y)));
      return {
        error: fullyHit(alert, alert.getBoundingClientRect()) && [...text.getClientRects()].every(box => fullyHit(alert, box)),
        save: (() => { const node = document.querySelector('${submit}'); return fullyHit(node, node.getBoundingClientRect()); })(),
        cancel: (() => { const node = document.querySelector('${cancel}'); return fullyHit(node, node.getBoundingClientRect()); })(),
      };
    })()`);
  };
  const sizes = [[1440, 900], [1024, 768], [390, 844]] as const;
  const responsive = sizes.flatMap(([width, height]) => ["zh", "en"].flatMap(locale =>
    ["light", "dark"].map(theme => ({ width, height, locale, theme }))));
  for (const { width, height, locale, theme } of [...responsive,
    { width: 1440, height: 640, locale: "zh", theme: "light" },
    { width: 1024, height: 600, locale: "en", theme: "dark" },
    { width: 390, height: 500, locale: "en", theme: "dark" },
  ]) {
    const variant = `${width}x${height}-${locale}-${theme}`;
    await t.test(variant, async () => {
      await f.command("Page.bringToFront", {}, f.sessionId);
      await f.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: f.origin, path: "/" }, f.sessionId);
      await f.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
      await f.setViewport(width, height);
      await f.navigate(() => f.command("Page.navigate", { url }, f.sessionId));
      await f.click(".navigator-project-settings");
      await f.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
      await f.waitFor(`document.querySelector('${edit}')?.getClientRects().length`);
      assert.equal(await f.evaluate("document.documentElement.dataset.resolvedTheme"), theme);
      const before = (await f.lists())[0]!;
      await f.click(edit);
      await f.fields({ display_name: "My unsaved checker", args: "--check --title \"Keep this input\" {file}", timeout_seconds: "5.25" });

      await second.command("Page.bringToFront");
      await second.viewport(width, height);
      await second.command("Page.navigate", { url: `${f.origin}${f.prefix}/settings/workspaces` });
      await second.wait(`document.querySelector('${edit}')?.getClientRects().length`);
      await second.click(edit);
      const winner = `Checker saved in the other tab ${before.version + 1}`;
      await second.fill(field("display_name"), winner);
      await second.click(submit);
      await second.wait(`!document.querySelector('${editor}').open`);
      const latest = (await f.lists())[0]!;
      assert.equal(latest.version, before.version + 1);
      assert.equal(latest.checkers[0]?.display_name, winner);

      await f.command("Page.bringToFront", {}, f.sessionId);
      await f.click(submit);
      await shown();
      assert.match(await f.evaluate<string>(`document.querySelector('${alert}').textContent`), locale === "en" ? /changed elsewhere and have been reloaded/ : /已重新读取/);
      const conflict = await snapshot(`${variant}-conflict`);
      assert.deepEqual(await Promise.all([value("display_name"), value("args"), value("timeout_seconds")]), ["My unsaved checker", "--check --title \"Keep this input\" {file}", "5.25"]);
      assert.deepEqual(await f.lists(), [latest]);
      await f.click(cancel);
      await f.focus(edit);
      await f.click(edit);
      assert.equal(await value("display_name"), winner);

      const longName = "Check the syntax of every changed source file before submitting the patch";
      const invalidProgram = "/tmp/not-a-program-name";
      await f.fields({ display_name: longName, executable: invalidProgram, timeout_seconds: "5.25" });
      await f.click(submit);
      await shown();
      assert.match(await f.evaluate<string>(`document.querySelector('${alert}').textContent`), /PATH/);
      const invalid = await snapshot(`${variant}-invalid`);
      assert.deepEqual(await Promise.all([value("display_name"), value("executable"), value("timeout_seconds")]), [longName, invalidProgram, "5.25"]);
      assert.deepEqual(await f.lists(), [latest]);
      await f.fields({ executable: "node" });
      await f.focus(submit);
      const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await f.command("Input.dispatchKeyEvent", { ...enter, type: "keyDown", text: "\r", unmodifiedText: "\r" }, f.sessionId);
      await f.command("Input.dispatchKeyEvent", { ...enter, type: "keyUp" }, f.sessionId);
      const saved = await f.saved();
      assert.equal(saved.version, latest.version + 1);
      assert.equal(saved.checkers[0]?.display_name, longName);
      assert.equal(saved.checkers[0]?.timeout_ms, 5250);
      await f.focus(edit);
      assert.deepEqual({ conflict, invalid }, {
        conflict: { error: true, save: true, cancel: true }, invalid: { error: true, save: true, cancel: true },
      }, "error text and both actions are fully visible without scrolling");
    });
  }
});
