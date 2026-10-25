import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { L, clientI18nScript, htmlLang, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG, EN, withPluginWords } from "@molis-ai/molis-work-app-workbench";
import { IMAGES_MESSAGES, renderImagesWorkbench } from "@molis-ai/molis-work-plugin-images";
import { GOALS_PLUGIN_ID, createGoalStateExplainer, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";
import { STABLE_KEY, isProductSource, scanTree, summarise, workingTreeSnapshot } from "../scripts/gates/translations.mjs";
// Goals' own sentences are English where Goals draws them, not on every page.
const goalsL: typeof L = (text, values) => withPluginWords(GOALS_PLUGIN_ID, () => L(text, values));
const { explainWorkState } = createGoalStateExplainer(goalsL);

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
  assert.equal(L("未登录"), "未登录");
  assert.equal(L("目标导航"), "目标导航");
  assert.equal(L("绑定到 Goal"), "绑定到 Goal");
  runWithLocale("en", () => {
    assert.equal(L("设置"), "Settings");
    assert.equal(L("未登录"), "Not signed in");
    assert.equal(L("登录"), "Sign in");
    assert.equal(L("登录功能暂未开放"), "Sign-in is not available yet");
    assert.equal(L("目标导航"), "Goal Navigator");
    assert.equal(L("目标关系图"), "Goal Graph");
    assert.equal(L("目标聚焦"), "Goal Focus");
    assert.equal(L("绑定到 Goal"), "Bound to Goal");
    assert.equal(goalsL("共 {count} 个{suffix}目标", { count: 3, suffix: "" }), "3 Goals");
    assert.equal(htmlLang(), "en");
  });
  assert.equal(htmlLang(), "zh-CN");
  assert.match(localeSetCookie("en"), /molis_work_locale=en/);
});

// The two lists of files this test used to read by hand (61 files, double-quoted calls only in one list and both quotes in the
// other) are gone: scripts/gates/translations.mjs scans every translator call in product source, in server renderers,
// plugin UI (`p.text`), wrappers and the browser scripts in template literals. CI runs the same scan through
// `scripts/check-health-gates.mjs`; it also reads every one of the (file, label) pairs the lists covered (about 2,430 distinct
// ones, all but 8 of them with Chinese in them).
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scan = scanTree(workingTreeSnapshot(repoRoot), isProductSource);

test("every translator call in the product source has an English translation", () => {
  const { detail, calls, callFiles } = summarise(scan);
  assert.ok(calls > 7000 && callFiles > 150, `read ${calls} translator calls in ${callFiles} files`);
  assert.deepEqual(detail.missing.map((item: { key: string; sites: Array<{ file: string; line: number }> }) => `${item.key} (${item.sites[0]!.file}:${item.sites[0]!.line})`), []);
});

test("the scan reads exactly the English the Host serves, the page's catalog and each Plugin's own words together", () => {
  // The scan finds the dictionaries by shape; what the running Host really sends to a page in English is the Workbench's `EN`,
  // the words of the Plugins the shell draws itself, and, kept apart per Plugin for its own frame, each Plugin's
  // `ui.translations`, with the stable-key words left out. They have to agree on the keys, and the English served for a key
  // has to be one the dictionaries give for it.
  const page: { MOLIS_WORK_MESSAGES?: Record<string, string>; MOLIS_WORK_PLUGIN_WORDS?: Record<string, Record<string, string>> } = {};
  runWithLocale("en", () => runInNewContext(clientI18nScript(), page));
  const inCatalog = Object.fromEntries(Object.entries(page.MOLIS_WORK_MESSAGES ?? {}).filter(([key]) => !STABLE_KEY.test(key)));
  const served = { ...Object.assign({}, ...Object.values(page.MOLIS_WORK_PLUGIN_WORDS ?? {})), ...inCatalog };
  assert.deepEqual([...scan.byKey.keys()].filter(key => !(key in served)), [], "keys the scan sees that the Host serves nowhere");
  assert.deepEqual(Object.keys(served).filter(key => !scan.byKey.has(key)), [], "keys the Host serves that the scan does not see");
  const unknown = [...scan.byKey].filter(([key, list]: [string, Array<{ value: string | null }>]) => !list.some(item => item.value === served[key])).map(([key]) => key);
  assert.deepEqual(unknown, [], "the served English is not any of the dictionaries' texts for the key");
});

test("a framed Plugin's Chinese-keyed English is handed to its own frame and is not in the page's catalog", () => {
  const page: { MOLIS_WORK_MESSAGES?: Record<string, string>; MOLIS_WORK_PLUGIN_WORDS?: Record<string, Record<string, string>> } = {};
  runWithLocale("en", () => runInNewContext(clientI18nScript(), page));
  const alchemist = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id.endsWith(".alchemist"))!;
  const others = new Set(BUILTIN_PLUGIN_CATALOG.filter(entry => entry !== alchemist).flatMap(entry => Object.keys(entry.manifest.ui.translations ?? {})));
  const own = Object.entries(alchemist.manifest.ui.translations ?? {}).filter(([key]) => !(key in EN) && !others.has(key));
  assert.ok(own.length > 50, `Alchemist has ${own.length} words of its own`);
  assert.deepEqual(own.filter(([key]) => key in (page.MOLIS_WORK_MESSAGES ?? {})).map(([key]) => key), [], "none of them reaches the whole page");
  assert.deepEqual(own.filter(([key, english]) => page.MOLIS_WORK_PLUGIN_WORDS?.[alchemist.manifest.plugin_id]?.[key] !== english).map(([key]) => key), [], "all of them reach its own frame");
  const zh: { MOLIS_WORK_PLUGIN_WORDS?: Record<string, Record<string, string>> } = {};
  runWithLocale("zh", () => runInNewContext(clientI18nScript(), zh));
  assert.deepEqual(Object.keys(zh.MOLIS_WORK_PLUGIN_WORDS ?? { missing: "" }), [], "the Chinese page carries no translations");
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
      assert.equal(L("images.compose.generate"), "Generate image");
      await chineseReady;
      assert.equal(L("images.compose.generate"), "Generate image");
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
    assert.equal(L("images.compose.generate"), "生成图片");
    assert.equal(L("设置"), "设置");
    assert.equal(htmlLang(), "zh-CN");
  });
  await Promise.all([english, chinese]);
  assert.equal(L("设置"), "设置");
});


// Pages' own "创建副本" is its word (PG-071: a Plugin's Chinese-keyed English reaches only what that Plugin draws), so the page-wide
// catalog keeps the clipboard's 复制 and Pages' frame, on the Host's side its contribution, gets 创建副本 as Duplicate.
test("SYS-48: clipboard Copy and Pages Duplicate stay distinct in the Host and browser", () => {
  const pagesId = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id.endsWith(".pages"))!.manifest.plugin_id;
  for (const locale of ["zh", "en"] as const) runWithLocale(locale, () => {
    const browser: { L?: typeof L; MOLIS_WORK_MESSAGES?: Record<string, string>; MOLIS_WORK_PLUGIN_WORDS?: Record<string, Record<string, string>> } = {};
    runInNewContext(clientI18nScript(), browser);
    assert.ok(browser.L);
    for (const translate of [L, browser.L]) assert.equal(translate("复制"), locale === "en" ? "Copy" : "复制");
    const duplicate = locale === "en" ? "Duplicate" : "创建副本";
    assert.equal(withPluginWords(pagesId, () => L("创建副本")), duplicate, "what Pages' contribution draws");
    const frame = { ...browser.MOLIS_WORK_PLUGIN_WORDS?.[pagesId], ...browser.MOLIS_WORK_MESSAGES };
    assert.equal(frame["创建副本"] ?? "创建副本", duplicate, "what Pages' frame is handed");
    assert.equal(frame["复制"] ?? "复制", locale === "en" ? "Copy" : "复制");
  });
});

// VUX-40 (found in the second real-scenario walk, 2026-10-23): Memory's state "暂停" once translated as "Paused" and won the
// merge, so the Assistant's Pause button read "Paused" in English. A state says 已暂停; the verb on a control stays 暂停.
test("VUX-40: the Pause control reads as a verb and the paused state as a state, in the Host and the browser", () => {
  runWithLocale("en", () => {
    const browser: { L?: typeof L } = {};
    runInNewContext(clientI18nScript(), browser);
    for (const translate of [L, browser.L!]) {
      assert.equal(translate("暂停"), "Pause");
      assert.equal(translate("已暂停"), "Paused");
    }
  });
});

test("RAC-56/RAC-57: owner messages reach the Host renderer and the actual browser translator in both languages", () => {
  for (const locale of ["zh", "en"] as const) runWithLocale(locale, () => {
    const browser: { L?: typeof L; LF?: (pluginId: string, key: string, vars?: Record<string, unknown>) => string } = {};
    runInNewContext(clientI18nScript(), browser);
    assert.ok(browser.L);
    for (const [key, message] of Object.entries(IMAGES_MESSAGES)) {
      assert.equal(L(key), message[locale], `Host: ${key}`);
      assert.equal(browser.L(key), message[locale], `browser: ${key}`);
    }
    assert.equal(L("images.compose.generate"), locale === "en" ? "Generate image" : "生成图片");
    // This is the English actually displayed before migration, after the shared Chinese-key catalog was merged.
    assert.equal(L("images.result.title"), locale === "en" ? "Results" : "生成结果");
    assert.equal(browser.LF?.(GOALS_PLUGIN_ID, "共 {count} 个{suffix}目标", { count: 3, suffix: "" }), locale === "en" ? "3 Goals" : "共 3 个目标");
    assert.equal(browser.L("设置"), locale === "en" ? "Settings" : "设置");
    assert.equal(browser.L("unregistered word"), "unregistered word");
    const page = renderImagesWorkbench({ primitives: { text: L, escape: String } });
    assert.doesNotMatch(page, /images\.(?:compose|service|history|account|result)\./);
    assert.ok(page.includes(locale === "en" ? "Describe your image" : "描述你想要的图片"));
    assert.ok(page.includes(locale === "en" ? "Manage image API keys in Connectors" : "在 Connectors 管理图像 API Key"));
  });
});
