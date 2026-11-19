import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentReviewDecisions } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";

// QEA-22: real Git preparation, project membership stop/start and Host-owned rejection in an isolated Home.
test("QEA-22 an earlier plugin activation cannot be approved after restart; the normal Git review lets the person reject it", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  assert.ok(b.projectId);
  const child = await pluginFrameBrowser(t, b, "git"), prefix = `/projects/${b.projectId}`;
  const repo = join(b.homeDirectory, "review-availability-repo");
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" } });
  git("init", "-q", "-b", "main"); await writeFile(join(repo, "note.md"), "original\n");
  git("add", "note.md"); git("commit", "-qm", "Original");
  await writeFile(join(repo, "note.md"), "original\nreviewed addition\n");
  await setProjectOutputFolder(b.web, b.projectId, repo);
  const go = (url: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + url }, b.sessionId));
  await go(prefix + "/?openPlugin=git"); await b.surfaceReady("git");
  await child.click("[data-git-path]"); await child.click("[data-git-index-action]");
  await b.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.getClientRects().length");
  const reviewId = await b.evaluate<string>("document.querySelector('[data-host-review-slot] [data-agent-review-approve]').dataset.agentReviewApprove");
  type Row = { request: { review_id: string }; receipt: { status: string }; decisions: AgentReviewDecisions };
  const review = async () => (await b.web.get<{ reviews: Row[] }>(prefix + "/api/agent/reviews")).reviews.find(row => row.request.review_id === reviewId)!;
  assert.deepEqual((await review()).decisions, { approve: { available: true }, reject: { available: true } });
  const switchPlugin = async (method: "POST" | "DELETE", plugin_id = "git") => {
    const index = await b.web.get<{ projects: Array<{ project_id: string; revision: string }> }>("/api/settings/project-plugins");
    const revision = index.projects.find(row => row.project_id === b.projectId)?.revision;
    assert.ok(revision);
    const path = `/api/settings/projects/${b.projectId}/plugins`, input = { plugin_id, expected_revision: revision };
    if (method === "DELETE") await b.web.delete(path, input); else await b.web.post(path, input);
  };
  await switchPlugin("DELETE");
  assert.deepEqual((await review()).decisions, { approve: { available: true }, reject: { available: true } },
    "hiding the standalone Git page does not stop Git while Coding still embeds it");
  await switchPlugin("DELETE", "coding");
  assert.deepEqual((await review()).decisions, { approve: { available: false, code: "agent.review_not_permitted", reason: { owner: "workbench", key: "workbench.agent-review.authority-ended" } }, reject: { available: true } });
  await switchPlugin("POST");
  assert.deepEqual((await review()).decisions, { approve: { available: false, code: "agent.review_not_permitted", reason: { owner: "workbench", key: "workbench.agent-review.authority-ended" } }, reject: { available: true } }, "a new activation cannot inherit the original approval authority");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  const saveShots = shouldSaveReviewScreenshots();
  const output = reviewEvidenceUrl("quality-experience-audit/"); if (saveShots) await mkdir(output, { recursive: true });
  for (const [locale, hint] of [["zh", "原授权已经失效"], ["en", "The original authority has ended"]] as const) {
    await go(`/locale?lang=${locale}&next=${encodeURIComponent(prefix + "/?openPlugin=git")}`); await b.surfaceReady("git");
    await child.click("[data-git-path]");
    await child.waitFor("document.querySelector('[data-git-results]')?.getAttribute('aria-busy') === 'false'");
    const selector = `[data-host-review-slot] [data-agent-review-item="${reviewId}"]`;
    await b.waitFor(`document.querySelector(${JSON.stringify(selector + " [data-agent-review-reject]")})?.getClientRects().length`);
    assert.equal(await b.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector + " [data-agent-review-approve]")}))`), false);
    assert.ok((await b.evaluate<string>(`document.querySelector(${JSON.stringify(selector)}).textContent`)).includes(hint));
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await b.setViewport(width, 900);
      await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
      await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
      await b.waitFor(`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width > 0`);
      assert.equal(await b.evaluate(`(() => { const row=document.querySelector(${JSON.stringify(selector)}), box=row.getBoundingClientRect();return box.left>=0 && box.right<=innerWidth && row.scrollWidth<=row.clientWidth; })()`), true, `${locale}/${width} review fits`);
      if (saveShots) {
        const { data } = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
        await writeFile(new URL(`review-availability-${locale}-${width}-${theme}.png`, output), Buffer.from(data, "base64"));
      }
    }
  }
  await b.click("[data-host-review-slot] [data-agent-review-reject]");
  await b.click("[data-page-dialog=confirm] [type=submit]");
  await b.waitFor("!document.querySelector('[data-host-review-slot] [data-agent-review-reject]')");
  assert.equal((await review()).receipt.status, "rejected");
  assert.equal((await review()).decisions.approve.available, false);
  assert.equal((await review()).decisions.reject.available, false);
  assert.equal(git("diff", "--cached", "--name-only"), "", "rejection never stages the file");
  assert.equal(git("show", "HEAD:note.md"), "original\n");
});
