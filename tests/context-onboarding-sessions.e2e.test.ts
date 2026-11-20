import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// SRB-09 (batch 35 item 1): an existing project's round offers the person's AI tool sessions. The project's AI may not read them until
// the person turns the permit on, here, on their own page; until then the row says why and nothing is organized from them.
test("SRB-09 B35-R1 the existing project's Sessions page opens onboarding and the person can allow the project's AI", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: origin }, sessionId);
  const projects = (await browser.web.get<{ projects: { project_id: string }[] }>("/api/settings/projects")).projects;
  const project = projects[0]!.project_id;
  const scope = async () => (await browser.web.get<{ project_ai_reads: { current?: boolean; allowed: boolean }[] }>(`/projects/${encodeURIComponent(project)}/api/sessions/scope`))
    .project_ai_reads.find(row => row.current)?.allowed ?? false;
  assert.equal(await scope(), false, "the permit starts off");

  const directory = `${REVIEW_EVIDENCE}/batch35-onboarding-sessions`;
  await mkdir(directory, { recursive: true });
  const capture = async (state: string) => {
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`${directory}/${state}.png`, Buffer.from(data, "base64"));
  };

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${encodeURIComponent(project)}/?openPlugin=sessions` }, sessionId));
  const entry = 'a[href^="/onboarding?project="]';
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(`[data-work-surface=sessions]:not([hidden]) ${entry}`)}))`);
  await click(entry);
  await waitFor("Boolean(document.querySelector('.ob-source[data-src=sessions]'))");
  assert.match(await evaluate<string>("document.querySelector('.ob-source[data-src=sessions]').textContent"), /读归到这个项目的 Claude Code、Codex 等会话/);
  await waitFor("Boolean(document.querySelector('[data-action=sessions-permit]'))");
  const panel = await evaluate<string>("document.querySelector('.ob-source[data-src=sessions] .ob-source__cfg').textContent");
  assert.match(panel, /这个项目的 AI 还不能读外部会话。没打开，这一步不整理会话。/);
  assert.match(panel, /只有你能打开/);
  await capture("permit-off");

  await click("[data-action=sessions-permit]");
  await waitFor("!document.querySelector('[data-action=sessions-permit]') && /还没有归到这个项目、AI 能读的会话/.test(document.querySelector('.ob-source[data-src=sessions] .ob-source__cfg')?.textContent || '')");
  assert.equal(await scope(), true, "the person's click turned the project's permit on");
  await capture("permit-on-none-filed");
});
