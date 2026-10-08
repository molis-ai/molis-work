import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EN, L, htmlLang, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "@molis-ai/molis-work-app-local-host";
import { createGoalStateExplainer, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";
import { isProductSource, scanTree, summarise, workingTreeSnapshot } from "../scripts/gates/translations.mjs";
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

// The two lists of files this test used to read by hand (61 files, double-quoted calls only in one list and both quotes in the
// other) are gone: scripts/gates/translations.mjs scans every translator call in product source, in server renderers,
// plugin UI (`p.text`), wrappers and the browser scripts in template literals. CI runs the same scan through
// `scripts/check-health-gates.mjs`; it also reads every one of the (file, label) pairs the lists covered (2,486 of them).
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scan = scanTree(workingTreeSnapshot(repoRoot), isProductSource);

test("every translator call in the product source has an English translation", () => {
  const { detail, calls, callFiles } = summarise(scan);
  assert.ok(calls > 7000 && callFiles > 150, `read ${calls} translator calls in ${callFiles} files`);
  assert.deepEqual(detail.missing.map((item: { key: string; sites: Array<{ file: string; line: number }> }) => `${item.key} (${item.sites[0]!.file}:${item.sites[0]!.line})`), []);
});

test("the scan reads exactly the English catalog the Host serves", () => {
  // The scan finds the dictionaries by shape; the catalog is what the running Host really holds (en.ts spreads them in its
  // own order, the last one wins). They have to agree on the keys, and the English served for a key has to be one the
  // dictionaries give for it.
  assert.deepEqual([...scan.byKey.keys()].filter(key => !(key in EN)), [], "keys the scan sees that the catalog lacks");
  assert.deepEqual(Object.keys(EN).filter(key => !scan.byKey.has(key)), [], "keys the catalog serves that the scan does not see");
  const unknown = [...scan.byKey].filter(([key, list]: [string, Array<{ value: string | null }>]) => !list.some(item => item.value === EN[key])).map(([key]) => key);
  assert.deepEqual(unknown, [], "the served English is not any of the dictionaries' texts for the key");
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
