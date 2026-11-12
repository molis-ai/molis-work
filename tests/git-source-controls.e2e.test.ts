import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

type AXTree = { nodes: { ignored: boolean; role?: { value: string }; name?: { value: string } }[] };
type Summary = { remotes: { name: string; url: string }[]; upstream: string | null; staged: { path: string }[] };

const control = (name: string) => `[data-git-${name}]`;
const node = (name: string) => `document.querySelector('${control(name)}')`;
const visible = (name: string) => `${node(name)}?.checkVisibility()`;

test("ACTCOPY-03 ACTCOPY-04: Git offers real operations as repository conditions change and keeps typed drafts", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded");
  if (!b) return;
  assert.ok(b.projectId);
  const frame = await pluginFrameBrowser(t, b, "git");
  const { command, sessionId, web } = b;
  const { evaluate, waitFor, click } = frame;
  const output = reviewEvidenceUrl("batch27-git-source-controls/");
  await mkdir(output, { recursive: true });
  const repo = join(b.homeDirectory, "launch-repo"), remote = join(b.homeDirectory, "launch-remote.git");
  const file = join(repo, "notes.md"), initial = "Launch notes\n";
  const git = (...args: string[]) => execFileSync("git", [
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false",
    "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", ...args,
  ], {
    cwd: repo, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ALLOW_PROTOCOL: "file", GIT_TERMINAL_PROMPT: "0" },
  }).trim();
  await mkdir(repo);
  git("init", "-q", "-b", "main");
  git("config", "--local", "core.hooksPath", "/dev/null");
  git("config", "--local", "commit.gpgsign", "false");
  git("config", "--local", "credential.helper", "");
  await writeFile(file, initial);
  git("add", "notes.md");
  git("commit", "-qm", "Launch notes");
  git("branch", "release-base");
  git("init", "--bare", "-q", "-b", "main", remote);
  const head = git("rev-parse", "HEAD");

  await setProjectOutputFolder(web, b.projectId, repo);
  const api = `/projects/${b.projectId}/api/plugins/io.molis.work.git`;
  const read = async () => (await web.get<{ summary: Summary }>(api + "/summary")).summary;
  const counts = { state: 0, summary: 0, support: 0, prepare: 0, decide: 0 };
  b.server.on("request", request => {
    const path = new URL(request.url ?? "/", b.origin).pathname;
    if (path === api + "/state") counts.state++;
    if (path === api + "/summary") counts.summary++;
    if (path === api + "/pr-support") counts.support++;
    if (request.method === "POST" && path === api + "/operations") counts.prepare++;
    if (request.method === "POST" && path === `/projects/${b.projectId}/api/agent/reviews/decide`) counts.decide++;
  });

  const url = `/projects/${b.projectId}/?openPlugin=git`;
  const go = (path: string) => b.navigate(() => command("Page.navigate", { url: b.origin + path }, sessionId));
  const text = (name: string) => evaluate<string>(`${node(name)}?.textContent.trim()`);
  const settled = `${visible("sc")} && !${node("refresh")}.disabled`;
  const refresh = async () => {
    const before = { ...counts };
    await click(control("refresh"));
    await waitFor(settled);
    assert.deepEqual([counts.state - before.state, counts.summary - before.summary], [1, 1], "one explicit refresh reads the state and its source summary once");
    assert.deepEqual([counts.support, counts.prepare], [before.support, before.prepare], "refresh does not prepare operations or check PR support");
  };
  const ax = async () => {
    const { nodes } = await frame.frameCommand<AXTree>("Accessibility.getFullAXTree", { frameId: await frame.frameId() });
    return nodes.filter(node => !node.ignored).map(node => [node.role?.value, node.name?.value]);
  };
  const press = async (key: "Enter" | "Tab") => {
    const code = key === "Enter" ? 13 : 9;
    const input = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await command("Input.dispatchKeyEvent", key === "Enter"
      ? { ...input, type: "keyDown", text: "\r", unmodifiedText: "\r" }
      : { ...input, type: "rawKeyDown" }, sessionId);
    await command("Input.dispatchKeyEvent", { ...input, type: "keyUp" }, sessionId);
  };
  const focus = async (name: string) => {
    await evaluate(`${node(name)}.focus()`);
    assert.equal(await evaluate(`document.activeElement === ${node(name)}`), true, name + " receives focus");
  };
  const type = async (name: string, value: string) => {
    await focus(name);
    await evaluate(`${node(name)}.select()`);
    await command("Input.insertText", { text: value }, sessionId);
  };
  const capture = async (name: string) => {
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(name + ".png", output), Buffer.from(data, "base64"));
  };

  await b.setViewport(1440, 900);
  await go(url);
  const unavailable = ["commit", "commit-draft", "pull", "push", "pr-toggle", "pr-form"];
  for (const [locale, remoteState, stagedState] of [["zh", "没有远端", "没有已暂存的文件"], ["en", "No remote", "No staged files"]] as const) {
    if (locale === "en") await go("/locale?lang=en&next=" + encodeURIComponent(url));
    await waitFor(settled);
    assert.equal(await text("sync"), remoteState);
    assert.equal(await text("commit-state"), stagedState);
    for (const width of [1440, 1024, 390]) {
      await b.setViewport(width, 900);
      for (const theme of ["light", "dark"]) {
        await b.evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
        const tree = await ax();
        for (const state of [remoteState, stagedState]) {
          assert.deepEqual(tree.filter(([role, name]) => name === state && role !== "InlineTextBox"), [["StaticText", state]]);
        }
        assert.equal(await evaluate(`[${unavailable.map(visible).join(",")}].some(Boolean)`), false);
        assert.equal(await evaluate(`(() => {
          const box = ${node("sc")}.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
        })()`), true, `${locale}/${theme}/${width} source control fits`);
        await capture(`no-remote-${locale}-${theme}-${width}`);
      }
    }
  }
  assert.deepEqual([counts.support, counts.prepare], [0, 0]);
  const original = await read();
  assert.deepEqual([original.remotes, original.upstream, original.staged], [[], null, []]);
  await b.setViewport(1024, 900);
  await click(control("commit-message"));
  const message = "Describe the launch";
  await command("Input.insertText", { text: message }, sessionId);
  await press("Tab");
  assert.equal(await evaluate(`document.activeElement === ${node("history")}`), true, "unavailable operations are skipped in the tab order");
  assert.deepEqual([counts.support, counts.prepare], [0, 0]);

  git("remote", "add", "origin", remote);
  await refresh();
  assert.equal(await text("sync"), "No remote tracking branch");
  assert.deepEqual((await ax()).filter(([role, name]) => name === "No remote tracking branch" && role !== "InlineTextBox"), [["StaticText", "No remote tracking branch"]]);
  assert.equal(await evaluate(visible("pull")), false);
  assert.ok((await ax()).some(([role, name]) => role === "button" && name === "Push and track this branch…"));
  await focus("push");
  await capture("no-upstream-en-dark-1024");
  await press("Tab");
  assert.equal(await evaluate(`document.activeElement === ${node("pr-toggle")}`), true);
  await press("Enter");
  await waitFor(`${node("pr-support")}?.textContent.includes('is a local path')`);
  assert.match(await text("pr-support"), /^The remote “origin” is a local path/u);
  assert.deepEqual([counts.support, counts.prepare], [1, 0]);
  assert.equal(await evaluate(`${node("pr-create")}.disabled`), true);
  await type("pr-title", "Friday launch");
  await type("pr-body", "Keep this description.");
  const drafts = () => evaluate<string[]>(`[${node("commit-message")}.value, ${node("pr-title")}.value, ${node("pr-body")}.value]`);
  const written = await drafts();
  assert.equal(written[0], message);
  assert.equal(written[1], "Friday launch");
  assert.equal(written[2], "Keep this description.");
  const prLayout = await evaluate(`(() => {
    const directory = ${node("browser")}.closest(".companion-directory");
    const bounds = directory.getBoundingClientRect();
    const clipped = [${["sc", "push", "pr-form", "pr-title", "pr-body"].map(node).join(", ")}].filter(control => {
      const box = control.getBoundingClientRect();
      return box.left < bounds.left || box.right > bounds.right || control.scrollWidth > control.clientWidth;
    }).map(control => control.outerHTML.slice(0, 120));
    return { scrollLeft: directory.scrollLeft, clipped };
  })()`);
  assert.deepEqual(prLayout, { scrollLeft: 0, clipped: [] }, "the English push label and focused PR form fit the narrow directory");
  await capture("local-remote-pr-refusal-en-dark-1024");

  git("remote", "remove", "origin");
  await refresh();
  assert.equal(await text("sync"), "No remote");
  assert.equal(await evaluate(`${visible("pr-toggle")} || ${visible("pr-form")}`), false);
  assert.equal(await evaluate(`${node("pr-toggle")}.getAttribute('aria-expanded')`), "false");
  assert.deepEqual(await drafts(), written);
  git("remote", "add", "origin", remote);
  await refresh();
  assert.equal(await evaluate(visible("pr-form")), false, "a restored remote offers the entrance without opening the form");
  await focus("pr-toggle");
  await press("Enter");
  await waitFor(`${node("pr-support")}?.textContent.includes('is a local path')`);
  assert.deepEqual([counts.support, counts.prepare], [2, 0]);
  assert.deepEqual(await drafts(), written);
  await click(control("pr-toggle"));

  // Set up a real tracking branch using the fixture's local bare repository only.
  git("push", "-q", "--set-upstream", "origin", "main");
  await refresh();
  const tracked = await read();
  assert.deepEqual(tracked.remotes.map(item => [item.name, item.url]), [["origin", remote]]);
  assert.equal(tracked.upstream, "origin/main");
  assert.equal(await text("pull"), "Pull…");
  assert.equal(await evaluate(visible("push")), false, "an up-to-date branch does not offer a push");

  await writeFile(file, initial + "Friday\n");
  git("add", "notes.md");
  await refresh();
  assert.equal(await evaluate(visible("commit-state")), false);
  assert.deepEqual((await read()).staged.map(item => item.path), ["notes.md"]);
  assert.ok((await ax()).some(([role, name]) => role === "button" && name === "Commit 1 staged file…"));
  assert.deepEqual(await drafts(), written);
  await focus("commit-message");
  await press("Tab");
  assert.equal(await evaluate(`document.activeElement === ${node("commit-draft")}`), true, "with staged content the draft action is reachable again");
  await press("Tab");
  assert.equal(await evaluate(`document.activeElement === ${node("commit")}`), true);
  await capture("staged-tracking-en-dark-1024");
  await press("Enter");
  const reject = "[data-host-review-slot] [data-agent-review-reject]";
  const confirm = "[data-page-dialog=confirm] [type=submit]";
  const reviewReady = `document.querySelector('${reject}')?.checkVisibility()`;
  const rejectReview = async () => {
    await b.click(reject);
    await b.waitFor(`document.querySelector('${confirm}')?.checkVisibility()`);
    await b.click(confirm);
    await b.waitFor(`!document.querySelector('${reject}')`);
  };
  await b.waitFor(reviewReady);
  assert.equal(counts.prepare, 1);
  await rejectReview();
  await waitFor(`${node("operations")}.querySelector('[data-outcome=denied]') && ${settled}`);
  const { operations } = await web.get<{ operations: { tool: string; outcome: string }[] }>(api + "/operations");
  assert.deepEqual(operations.map(operation => [operation.tool, operation.outcome]), [["git-commit", "denied"]]);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(git("diff", "--cached", "--name-only"), "notes.md");
  assert.deepEqual(await drafts(), written);

  // A branch in the same repository can be a valid upstream without a configured remote.
  await click(control("close"));
  git("restore", "--staged", "notes.md");
  await writeFile(file, initial);
  git("remote", "remove", "origin");
  git("branch", "--set-upstream-to=release-base", "main");
  await refresh();
  const local = await read();
  assert.deepEqual([local.remotes, local.upstream], [[], "release-base"]);
  assert.equal(await text("sync"), "No remote");
  assert.equal(await evaluate(visible("pr-toggle")), false);
  assert.equal(await evaluate(visible("push")), false);
  assert.equal(await text("pull"), "Pull…");
  await focus("pull");
  await capture("local-upstream-en-dark-1024");
  await press("Enter");
  await b.waitFor(reviewReady);
  assert.deepEqual([counts.support, counts.prepare], [2, 2]);
  await rejectReview();
  await waitFor(`${node("operations")}.querySelectorAll('[data-outcome=denied]').length === 2 && ${settled}`);
  const history = await web.get<{ operations: { tool: string; outcome: string }[] }>(api + "/operations");
  assert.ok(history.operations.some(operation => operation.tool === "git-pull" && operation.outcome === "denied"));
  assert.deepEqual(await drafts(), written);
  assert.equal(counts.decide, 2);
  t.diagnostic("Git: 1 state and 1 summary per refresh; 0 PR checks without a remote, 2 explicit checks with a local remote; 1 commit and 1 local pull reached review and were rejected. The rejected commit kept HEAD, index and drafts.");
});
