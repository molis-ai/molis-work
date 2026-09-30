import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { TODO_ACTION_PERMISSIONS, openTodoStore, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { withContextJourneys, type ContextJourney } from "../apps/local-host/src/context-onboarding-store.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

const MAIL = "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。";
const TODOS = JSON.stringify({
  candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, phrase: null }, placement: "project",
      evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], depends_on: ["c2"] },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null }, placement: "project",
      waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null },
      evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
  ],
  reference_only: [{ summary: "团建改到周四（通知）", material: 1 }],
});

for (const width of [1440, 390]) test(`Onboarding ${width}px: the overview and todo drafts side by side; kept drafts become the new project's todos and Todo opens`, { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => TODOS);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, homeDirectory, localHost } = browser;
  // A journey that has already read its material and organized it: the drafts are a real Todo batch.
  const { batch } = await localHost.homeActionClient().invoke({ actor_id: "web-user", project_id: null, audience: "user", permissions: [...TODO_ACTION_PERMISSIONS, "model:invoke"] },
    todoOrganizeActions.extract, { title: "开始使用时整理的待办", origin: "onboarding", materials: [{ title: "张总：新版方案", text: MAIL }] });
  const id = randomUUID();
  const reference = { source_id: "m1", version: 1 as const, label: "S1", title: "张总：新版方案", path: "mail.md", body: MAIL,
    original: { filename: "mail.md", mime: "text/markdown", data_base64: Buffer.from(MAIL).toString("base64") } };
  withContextJourneys(homeDirectory, store => {
    const journey = store.create(id) as ContextJourney;
    journey.sources = [{ kind: "browser", selected: true, references: [reference] }];
    journey.phase = "review";
    journey.summary = { title: "新版方案", body: "张总要求周五前发新版方案，预算等小李确认。[S1]", references: [reference] };
    journey.todo = { status: "ready", batch_id: batch.batch_id, batch, error: null };
    return store.save(journey);
  });
  const output = new URL(`../${specEvidenceDirectory("specs/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project&journey=${id}` }, sessionId));
  await waitFor("document.querySelectorAll('[data-draft]').length === 3");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-draft]')].map(node => node.checked)"), [true, true, false]);
  assert.match(String(await evaluate("document.querySelector('[data-action=adopt]').textContent")), /采用，加入 2 项待办并开始/);
  assert.match(String(await evaluate("document.querySelector('.cx-drafts').textContent")), /“请周五前发新版方案”/);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "不横向滚动");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`onboarding-drafts-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId)).data, "base64"));

  // Keep only the first one; the rest wait in Todo.
  await click(".cx-draft:nth-of-type(2) [data-draft]");
  await waitFor("document.querySelector('[data-action=adopt]').textContent.includes('加入 1 项待办')");
  await navigate(() => click("[data-action=adopt]"));
  await waitFor("location.pathname.startsWith('/projects/') && new URL(location.href).searchParams.get('openPlugin') === 'todo'");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click("[data-plugin-strip] [data-plugin-id=todo]");
  await waitFor("document.body.dataset.desktopSurface === 'todo'");
  const store = openTodoStore(homeDirectory);
  try {
    const items = store.list({ projectId: null, everything: true, actor: "user", actorId: "test" });
    assert.deepEqual(items.map(item => item.title), ["发送新版方案"]);
    assert.equal(items[0]!.sources[0]!.kind, "onboarding");
  } finally { store.close(); }
  await waitFor("!document.querySelector('[data-todo-view=review]').hidden");
});
