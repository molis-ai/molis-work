import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EN, L, htmlLang, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "@molis-ai/molis-work-app-local-host";
import { explainGoalDecision } from "@molis-ai/molis-work-plugin-goals";
import { createGoalStateExplainer, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";
const { explainWorkState } = createGoalStateExplainer(L);

test("locale defaults to Chinese, then cookie, then Accept-Language", () => {
  assert.equal(resolveWebLocale(undefined, undefined), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=en", "zh-CN"), "en");
  assert.equal(resolveWebLocale("theme=light; molis_work_locale=zh", "en-US"), "zh");
  assert.equal(resolveWebLocale(undefined, "en-US,en;q=0.9"), "en");
  assert.equal(resolveWebLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=de", "fr-FR"), "zh");
});

test("safe next path only allows same-origin relative locations", () => {
  assert.equal(safeNextPath("/settings/runtimes"), "/settings/runtimes");
  assert.equal(safeNextPath("%2Fprojects%2Fdemo%2F"), "/projects/demo/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("/ok\nLocation: https://evil.example"), "/");
  assert.equal(safeNextPath(undefined), "/");
});

test("L translates chrome in an English request and keeps Chinese as source", () => {
  assert.equal(L("设置"), "设置");
  assert.equal(L("目标导航"), "目标导航");
  assert.equal(L("绑定到 Goal"), "绑定到 Goal");
  runWithLocale("en", () => {
    assert.equal(L("设置"), "Settings");
    assert.equal(L("目标导航"), "Goal Navigator");
    assert.equal(L("目标关系图"), "Goal Graph");
    assert.equal(L("目标聚焦"), "Goal Focus");
    assert.equal(L("绑定到 Goal"), "Bound to Goal");
    assert.equal(L("共 {count} 个{suffix}目标", { count: 3, suffix: "" }), "3 Goals");
    assert.equal(htmlLang(), "en");
  });
  assert.equal(htmlLang(), "zh-CN");
  assert.match(localeSetCookie("en"), /molis_work_locale=en/);
});

test("every static renderer label has an English translation", () => {
  // Keep checking the labels after the page and Goals directory move to their owners.
  const source = ["../apps/workbench/src/renderer.ts", "../apps/workbench/src/goals-page-renderer.ts",
    "../apps/workbench/src/onboarding-renderer.ts", "../apps/workbench/src/project-directory-renderer.ts",
    "../apps/workbench/src/settings-navigation.ts", "../apps/workbench/src/settings-renderer.ts",
    "../apps/workbench/src/project-settings-stage.ts",
    "../apps/workbench/src/human-review-renderer.ts",
    "../apps/workbench/src/focus-sections.ts", "../apps/workbench/src/project-settings-pages.ts",
    "../apps/workbench/src/immersive-shell.ts", "../apps/workbench/src/project-home.ts",
    "../apps/workbench/src/settings-directory.ts",
    "../apps/workbench/src/settings-connectors.ts",
    "../apps/workbench/src/scripts/connectors-settings.ts",
    "../apps/local-host/src/connector-directory.ts",
    "../apps/workbench/src/settings-appearance.ts",
    "../apps/workbench/src/feed-projection-ui.ts",
    "../apps/workbench/src/inbox-projection-ui.ts",
    "../apps/workbench/src/scripts/client/navigation-inbox.ts",
    "../apps/workbench/src/scripts/client/plugin-workbench.ts",
    "../apps/workbench/src/scripts/client/immersive-navigation.ts",
    "../apps/workbench/src/scripts/client/assistant-island.ts",
    "../apps/workbench/src/scripts/client/global-search.ts",
    "../apps/workbench/src/scripts/client/tab-workspace.ts",
    "../apps/workbench/src/scripts/client/settings-directory.ts",
    "../apps/workbench/src/scripts/client/project-home.ts",
    "../apps/workbench/src/scripts/client/project-home-shortcuts.ts",
    "../apps/workbench/src/scripts/client/events-secondary.ts",
    "../plugins/native/goals/src/event-document-ui.ts",
    "../plugins/native/goals/src/event-document-forms.ts",
    "../plugins/native/goals/src/event-document-client.ts",
    "../plugins/native/goals/src/event-history-body.ts",
    "../plugins/native/goals/src/risk-decision-ui.ts", "../plugins/native/goals/src/decision-common-ui.ts",
    "../plugins/native/goals/src/tree-ui.ts", "../plugins/native/goals/src/kanban-ui.ts", "../plugins/native/goals/src/policy-ui.ts",
    "../plugins/native/goals/src/project-policy-client.ts",
    "../plugins/native/work/src/ui/render.ts",
    "../plugins/native/work/src/ui/session-add-client.ts",
    "../plugins/native/work/src/ui/associations-client.ts",
    "../plugins/native/work/src/ui/handoff-client.ts",
    "../plugins/native/work/src/ui/content-client.ts",
    "../plugins/native/work/src/ui/browser.ts",
    "../plugins/native/feed/src/ui.ts",
    "../plugins/native/inbox/src/ui.ts",
    "../plugins/native/inbox/src/projection.ts",
    "../plugins/native/schedule/src/ui.ts",
    "../plugins/native/schedule/src/client.ts",
    "../plugins/native/shelf/src/ui.ts",
    "../plugins/native/shelf/src/settings-ui.ts",
    "../plugins/native/shelf/src/settings-client.ts",
    "../plugins/native/shelf/src/client.ts",
    "../plugins/native/artifacts/src/browser-ui.ts",
    "../plugins/native/artifacts/src/reference-ui.ts"]
    .map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  const labels = [...source.matchAll(/\b(?:L|p\.text)\("((?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`) as string);
  const projection = readFileSync(new URL("../plugins/native/inbox/src/projection.ts", import.meta.url), "utf8");
  const projectionLabels = [...projection.matchAll(/\btext\("((?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`) as string);
  const missing = [...new Set([...labels, ...projectionLabels].filter((label) => EN[label] == null))];
  assert.deepEqual(missing, []);
});

test("every work state explains what it means, what to do, and how to continue in both languages", () => {
  const states: GoalPresentationState[] = [
    "waiting_for_human", "executing", "execution_blocked", "execution_pending",
    "satisfied", "invalidated", "trashed", "archived",
  ];
  for (const state of states) {
    const zh = explainWorkState(state);
    assert.ok(zh.label && zh.meaning && zh.nextAction && zh.howToContinue, state);
    runWithLocale("en", () => {
      const en = explainWorkState(state);
      assert.ok(en.label && en.meaning && en.nextAction && en.howToContinue, state);
      assert.notEqual(en.meaning, zh.meaning, `${state} should have an English explanation`);
    });
  }
});

test("work state labels stay concise and professional", () => {
  assert.equal(explainWorkState("waiting_for_human").label, "需要你决定");
  assert.equal(explainWorkState("executing").label, "正在推进");
  assert.equal(explainWorkState("execution_blocked").label, "可记录，尚不可完成");
  assert.equal(explainWorkState("execution_pending").label, "可记录");
  assert.equal(explainWorkState("satisfied").label, "已完成");
  assert.equal(explainWorkState("invalidated").label, "已取消");
  assert.equal(explainWorkState("trashed").label, "回收站");
  assert.equal(explainWorkState("archived").label, "已归档");
});

test("all five decision types start with the user's question and explain missing evidence", () => {
  const kinds = ["contract", "candidate", "rewire", "review", "risk"] as const;
  for (const kind of kinds) {
    const zh = explainGoalDecision(kind, L);
    assert.match(zh.question, /[？?]$/);
    assert.match(zh.insufficientEvidence, /不能可靠|不能可靠判断/);
    runWithLocale("en", () => {
      const en = explainGoalDecision(kind, L);
      assert.match(en.question, /\?$/);
      assert.match(en.insufficientEvidence, /not enough evidence/i);
    });
  }
});


test("Host request locales stay isolated across interleaved async rendering and rejected work", async () => {
  let enteredChinese!: () => void;
  let checkedEnglish!: () => void;
  const chineseReady = new Promise<void>((resolve) => { enteredChinese = resolve; });
  const englishChecked = new Promise<void>((resolve) => { checkedEnglish = resolve; });
  const english = runWithLocale("en", async () => {
    try {
      assert.equal(L("设置"), "Settings");
      await chineseReady;
      assert.equal(L("设置"), "Settings");
      assert.equal(htmlLang(), "en");
      await assert.rejects(runWithLocale("zh", async () => {
        await Promise.resolve();
        assert.equal(L("设置"), "设置");
        throw new Error("render rejected");
      }), /render rejected/);
      assert.equal(L("设置"), "Settings");
    } finally {
      checkedEnglish();
    }
  });
  const chinese = runWithLocale("zh", async () => {
    enteredChinese();
    await englishChecked;
    assert.equal(L("设置"), "设置");
    assert.equal(htmlLang(), "zh-CN");
  });
  await Promise.all([english, chinese]);
  assert.equal(L("设置"), "设置");
});
